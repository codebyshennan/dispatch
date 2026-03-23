import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { PassThrough } from 'stream';
import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// MonthlyReportData interface
// ---------------------------------------------------------------------------

export interface CostSavingsSection {
  ticketsAutomated: number;
  costPerTicketDelta: number;  // USD
  totalSavings: number;         // USD
  month: string;
}

export interface TrustpilotMonthRating {
  month: string;   // YYYY-MM
  avgRating: number;
  reviewCount: number;
}

export interface TrustpilotTrendSection {
  trend: TrustpilotMonthRating[];
}

export interface HeadcountEfficiencySection {
  totalDraftsUsed: number;
  totalTickets: number;
  efficiencyPct: number;         // percentage (0-100)
  label: string;                 // formatted string for PDF
}

export interface TopProductInsightsSection {
  insights: string[];  // top-3 strings
  month: string;
}

export interface ComplianceIncidentsSection {
  count: number;
  month: string;
}

export interface NpsAggregateSection {
  meanScore: number;
  responseCount: number;
  month: string;
}

export interface MonthlyReportData {
  month: string;                    // YYYY-MM of the reported period
  generatedAt: string;              // ISO timestamp
  costSavings: CostSavingsSection;
  trustpilotTrend: TrustpilotTrendSection;
  headcountEfficiency: HeadcountEfficiencySection;
  topProductInsights: TopProductInsightsSection;
  complianceIncidents: ComplianceIncidentsSection;
  npsAggregate: NpsAggregateSection;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COST_PER_TICKET_DELTA = 8.50;  // USD: average cost delta between human-handled and Meridian-assisted

// ---------------------------------------------------------------------------
// buildMonthlyExecutiveSummary
// ---------------------------------------------------------------------------

export async function buildMonthlyExecutiveSummary(
  dynamo: DynamoDBClient,
  tableName: string,
  s3: S3Client,
  bucketName: string,
  prevMonth: string,  // YYYY-MM format
): Promise<MonthlyReportData> {
  const generatedAt = new Date().toISOString();

  const [
    costSavings,
    trustpilotTrend,
    headcountEfficiency,
    topProductInsights,
    complianceIncidents,
    npsAggregate,
  ] = await Promise.all([
    fetchCostSavings(dynamo, tableName, prevMonth),
    fetchTrustpilotTrend(s3, bucketName),
    fetchHeadcountEfficiency(dynamo, tableName, prevMonth),
    fetchTopProductInsights(dynamo, tableName, prevMonth),
    fetchComplianceIncidents(dynamo, tableName, prevMonth),
    fetchNpsAggregate(dynamo, tableName, prevMonth),
  ]);

  return {
    month: prevMonth,
    generatedAt,
    costSavings,
    trustpilotTrend,
    headcountEfficiency,
    topProductInsights,
    complianceIncidents,
    npsAggregate,
  };
}

// ---------------------------------------------------------------------------
// Cost Savings — METRICS#acceptance records with sent=true + editDistancePct < 0.20
// ---------------------------------------------------------------------------

async function fetchCostSavings(
  dynamo: DynamoDBClient,
  tableName: string,
  prevMonth: string,
): Promise<CostSavingsSection> {
  // Query METRICS#acceptance records for the previous month
  // sk format: ACCEPTANCE#<ISO timestamp> — filter by month prefix
  const monthStart = `ACCEPTANCE#${prevMonth}-01T00:00:00.000Z`;
  const monthEnd = `ACCEPTANCE#${prevMonth}-31T23:59:59.999Z`;

  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': { S: 'METRICS#acceptance' },
      ':start': { S: monthStart },
      ':end': { S: monthEnd },
    },
  }));

  const items = result.Items ?? [];
  const sentItems = items.filter((item) => item['sent']?.BOOL === true);
  const ticketsAutomated = sentItems.filter(
    (item) => parseFloat(item['editDistancePct']?.N ?? '1') < 0.20,
  ).length;

  const totalSavings = ticketsAutomated * COST_PER_TICKET_DELTA;

  return {
    ticketsAutomated,
    costPerTicketDelta: COST_PER_TICKET_DELTA,
    totalSavings: parseFloat(totalSavings.toFixed(2)),
    month: prevMonth,
  };
}

// ---------------------------------------------------------------------------
// Trustpilot Trend — last 3 monthly S3 review files
// ---------------------------------------------------------------------------

interface ReviewLine {
  rating: number;
  createdAt?: string;
  date?: string;
  timestamp?: string;
}

async function fetchTrustpilotTrend(
  s3: S3Client,
  bucketName: string,
): Promise<TrustpilotTrendSection> {
  const listResult = await s3.send(new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: 'reviews/trustpilot',
    MaxKeys: 20,
  }));

  const objects = listResult.Contents ?? [];
  const sortedObjects = objects
    .filter((o) => o.Key)
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .slice(0, 3);

  const trend: TrustpilotMonthRating[] = [];

  for (const obj of sortedObjects) {
    try {
      const getResult = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: obj.Key!,
      }));

      const body = await getResult.Body?.transformToString();
      if (!body) continue;

      // Infer month from object key (e.g. reviews/trustpilot/2026-02-*.json)
      const keyMatch = obj.Key!.match(/(\d{4}-\d{2})/);
      const month = keyMatch ? keyMatch[1]! : (obj.LastModified?.toISOString().slice(0, 7) ?? 'unknown');

      let totalRating = 0;
      let count = 0;

      const lines = body.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const review = JSON.parse(line) as ReviewLine;
          if (typeof review.rating === 'number') {
            totalRating += review.rating;
            count++;
          }
        } catch { /* skip */ }
      }

      trend.push({
        month,
        avgRating: count > 0 ? parseFloat((totalRating / count).toFixed(2)) : 0,
        reviewCount: count,
      });
    } catch { /* skip unreadable objects */ }
  }

  // Sort by month ascending for the trend display
  trend.sort((a, b) => a.month.localeCompare(b.month));

  return { trend };
}

// ---------------------------------------------------------------------------
// Headcount Efficiency — totalDraftsUsed / totalTickets
// ---------------------------------------------------------------------------

async function fetchHeadcountEfficiency(
  dynamo: DynamoDBClient,
  tableName: string,
  prevMonth: string,
): Promise<HeadcountEfficiencySection> {
  const monthStart = `ACCEPTANCE#${prevMonth}-01T00:00:00.000Z`;
  const monthEnd = `ACCEPTANCE#${prevMonth}-31T23:59:59.999Z`;

  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': { S: 'METRICS#acceptance' },
      ':start': { S: monthStart },
      ':end': { S: monthEnd },
    },
  }));

  const items = result.Items ?? [];
  const totalTickets = items.length;
  const totalDraftsUsed = items.filter(
    (item) => item['sent']?.BOOL === true,
  ).length;

  const efficiencyPct = totalTickets > 0
    ? parseFloat(((totalDraftsUsed / totalTickets) * 100).toFixed(1))
    : 0;

  return {
    totalDraftsUsed,
    totalTickets,
    efficiencyPct,
    label: `${efficiencyPct}% of tickets handled without full manual response`,
  };
}

// ---------------------------------------------------------------------------
// Top Product Insights — VOC#insight#{prevMonth} DynamoDB record
// ---------------------------------------------------------------------------

async function fetchTopProductInsights(
  dynamo: DynamoDBClient,
  tableName: string,
  prevMonth: string,
): Promise<TopProductInsightsSection> {
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': { S: `VOC#insight#${prevMonth}` },
      ':skPrefix': { S: 'INSIGHT#' },
    },
    Limit: 1,
    ScanIndexForward: false,
  }));

  const item = result.Items?.[0];
  if (!item) {
    return {
      insights: ['Insufficient VoC data for this period'],
      month: prevMonth,
    };
  }

  let themes: string[] = [];
  try {
    const raw = item['top_themes']?.S ?? item['topThemes']?.S ?? '[]';
    const parsed = JSON.parse(raw) as string[];
    themes = parsed.slice(0, 3);
  } catch { /* fall through */ }

  if (themes.length === 0) {
    themes = ['Insufficient VoC data for this period'];
  }

  return { insights: themes, month: prevMonth };
}

// ---------------------------------------------------------------------------
// Compliance Incidents — CLASSIFICATION# records with compliance_flags non-empty
// ---------------------------------------------------------------------------

async function fetchComplianceIncidents(
  dynamo: DynamoDBClient,
  tableName: string,
  prevMonth: string,
): Promise<ComplianceIncidentsSection> {
  // Scan CLASSIFICATION# records for the month with non-empty compliance_flags
  const monthStart = `${prevMonth}-01T00:00:00.000Z`;
  const monthEnd = `${prevMonth}-31T23:59:59.999Z`;

  const result = await dynamo.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'begins_with(pk, :pkPrefix) AND createdAt BETWEEN :start AND :end AND attribute_exists(compliance_flags)',
    ExpressionAttributeValues: {
      ':pkPrefix': { S: 'CLASSIFICATION#' },
      ':start': { S: monthStart },
      ':end': { S: monthEnd },
    },
    Limit: 500,
  }));

  const items = result.Items ?? [];
  // Count items where compliance_flags is a non-empty list
  const incidentCount = items.filter((item) => {
    const flags = item['compliance_flags']?.L ?? item['compliance_flags']?.SS;
    return Array.isArray(flags) && flags.length > 0;
  }).length;

  return { count: incidentCount, month: prevMonth };
}

// ---------------------------------------------------------------------------
// NPS Aggregate — METRICS#nps records for prevMonth
// ---------------------------------------------------------------------------

async function fetchNpsAggregate(
  dynamo: DynamoDBClient,
  tableName: string,
  prevMonth: string,
): Promise<NpsAggregateSection> {
  // Query all NPS records for the previous month: sk starts with NPS#${prevMonth}#
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': { S: 'METRICS#nps' },
      ':skPrefix': { S: `NPS#${prevMonth}#` },
    },
  }));

  const items = result.Items ?? [];
  if (items.length === 0) {
    return { meanScore: 0, responseCount: 0, month: prevMonth };
  }

  const scores = items
    .map((item) => parseFloat(item['score']?.N ?? '0'))
    .filter((s) => s >= 1 && s <= 10);

  const meanScore = scores.length > 0
    ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
    : 0;

  return { meanScore, responseCount: items.length, month: prevMonth };
}

// ---------------------------------------------------------------------------
// generatePdf — PDFKit Buffer generation
// ---------------------------------------------------------------------------

export function generatePdf(data: MonthlyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
    const pass = new PassThrough();
    const chunks: Buffer[] = [];

    pass.on('data', (chunk: Buffer) => chunks.push(chunk));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);

    doc.pipe(pass);

    // ---------------------------------------------------------------------------
    // Title page
    // ---------------------------------------------------------------------------
    doc
      .fontSize(22)
      .text('Meridian Executive Summary', { align: 'center' })
      .moveDown(0.5)
      .fontSize(16)
      .text(`Month: ${data.month}`, { align: 'center' })
      .moveDown(0.3)
      .fontSize(11)
      .text('Reap | Powered by Meridian CX Intelligence', { align: 'center' })
      .moveDown(0.3)
      .fontSize(10)
      .fillColor('#888888')
      .text(`Generated: ${data.generatedAt}`, { align: 'center' })
      .fillColor('#000000')
      .moveDown(2);

    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(1);

    // ---------------------------------------------------------------------------
    // 1. Cost Savings
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('1. Cost Savings', { underline: true }).moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Tickets automated (drafts used with <20% edit distance): ${data.costSavings.ticketsAutomated}`);
    doc.text(`Cost delta per ticket: $${data.costSavings.costPerTicketDelta.toFixed(2)} USD`);
    doc.fontSize(13).text(`Estimated monthly savings: $${data.costSavings.totalSavings.toFixed(2)} USD`, { continued: false });
    doc.fontSize(11).moveDown(1);

    // ---------------------------------------------------------------------------
    // 2. Trustpilot Rating Trend
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('2. Trustpilot Rating Trend', { underline: true }).moveDown(0.5);
    if (data.trustpilotTrend.trend.length === 0) {
      doc.fontSize(11).text('No Trustpilot data available.').moveDown(1);
    } else {
      // Simple text table
      doc.fontSize(11);
      const colMonth = 60;
      const colRating = 220;
      const colReviews = 340;
      const headerY = doc.y;
      doc.text('Month', colMonth, headerY, { continued: false });
      doc.text('Avg Rating', colRating, headerY, { continued: false });
      doc.text('Reviews', colReviews, headerY, { continued: false });
      doc.moveDown(0.3);
      doc.moveTo(60, doc.y).lineTo(430, doc.y).stroke();
      doc.moveDown(0.3);

      for (const row of data.trustpilotTrend.trend) {
        const rowY = doc.y;
        doc.text(row.month, colMonth, rowY, { continued: false });
        doc.text(row.avgRating.toFixed(2), colRating, rowY, { continued: false });
        doc.text(String(row.reviewCount), colReviews, rowY, { continued: false });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.7);
    }

    // ---------------------------------------------------------------------------
    // 3. Headcount Efficiency
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('3. Headcount Efficiency', { underline: true }).moveDown(0.5);
    doc.fontSize(11);
    doc.text(data.headcountEfficiency.label);
    doc.text(`Drafts sent: ${data.headcountEfficiency.totalDraftsUsed} / Total tickets: ${data.headcountEfficiency.totalTickets}`);
    doc.moveDown(1);

    // ---------------------------------------------------------------------------
    // 4. Top Product Insights (from VoC analysis)
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('4. Top Product Insights', { underline: true }).moveDown(0.5);
    doc.fontSize(11);
    data.topProductInsights.insights.forEach((insight, i) => {
      doc.text(`${i + 1}. ${insight}`);
      doc.moveDown(0.3);
    });
    doc.moveDown(0.7);

    // ---------------------------------------------------------------------------
    // 5. Compliance Incidents
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('5. Compliance Incidents', { underline: true }).moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Tickets with compliance flags: ${data.complianceIncidents.count}`);
    doc.moveDown(1);

    // ---------------------------------------------------------------------------
    // 6. Agent NPS
    // ---------------------------------------------------------------------------
    doc.fontSize(14).text('6. Agent NPS', { underline: true }).moveDown(0.5);
    doc.fontSize(11);
    if (data.npsAggregate.responseCount === 0) {
      doc.text('No NPS responses recorded for this period.');
    } else {
      doc.text(`Mean score: ${data.npsAggregate.meanScore.toFixed(2)} / 10`);
      doc.text(`Response count: ${data.npsAggregate.responseCount}`);
    }
    doc.moveDown(1);

    // ---------------------------------------------------------------------------
    // Footer line
    // ---------------------------------------------------------------------------
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#888888').text('Confidential — Reap internal use only', { align: 'center' });

    doc.end();
  });
}
