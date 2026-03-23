import { buildWeeklyCxReport } from './weekly.js';
import { buildMonthlyExecutiveSummary, generatePdf } from './monthly.js';
import { sendViaSes, sendViaSlack, sendMonthlyViaSes } from './deliver.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Event interface
// ---------------------------------------------------------------------------

interface ReportingEvent {
  type?: string;
}

// ---------------------------------------------------------------------------
// Lambda handler
// Dispatches on event.type:
//   - 'weekly_cx_report': build report + deliver via SES + Slack
//   - default: log warning and return
// ---------------------------------------------------------------------------

export async function handler(event: ReportingEvent): Promise<void> {
  const eventType = event?.type ?? 'unknown';

  if (eventType === 'monthly_executive_summary') {
    await handleMonthlyExecutiveSummary();
    return;
  }

  if (eventType !== 'weekly_cx_report') {
    console.warn(`ReportingLambda: unrecognised event type "${eventType}" — no-op`);
    return;
  }

  const sesFromAddress = process.env.SES_FROM_ADDRESS!;
  const sesRaw = process.env.SES_TO_ADDRESSES ?? '';
  const toAddresses = sesRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL ?? '';

  console.log(`ReportingLambda: building weekly CX report…`);
  const report = await buildWeeklyCxReport();

  console.log(`ReportingLambda: report built for week ${report.weekOf} — delivering…`);

  const deliveryPromises: Promise<void>[] = [];

  if (toAddresses.length > 0) {
    deliveryPromises.push(
      sendViaSes(report, toAddresses, sesFromAddress).catch((err: unknown) => {
        console.error('ReportingLambda: SES delivery failed', err);
      }),
    );
  } else {
    console.warn('ReportingLambda: SES_TO_ADDRESSES is empty — skipping SES delivery');
  }

  if (slackWebhookUrl) {
    deliveryPromises.push(
      sendViaSlack(report, slackWebhookUrl).catch((err: unknown) => {
        console.error('ReportingLambda: Slack delivery failed', err);
      }),
    );
  } else {
    console.warn('ReportingLambda: SLACK_WEBHOOK_URL not set — skipping Slack delivery');
  }

  await Promise.all(deliveryPromises);

  console.log(`ReportingLambda: delivery complete for week ${report.weekOf}`);
}

// ---------------------------------------------------------------------------
// Monthly executive summary handler
// ---------------------------------------------------------------------------

async function handleMonthlyExecutiveSummary(): Promise<void> {
  const tableName = process.env.AUDIT_TABLE_NAME!;
  const bucketName = process.env.S3_ASSETS_BUCKET!;
  const sesFromAddress = process.env.SES_FROM_ADDRESS!;
  const sesRaw = process.env.SES_TO_ADDRESSES ?? '';
  const toAddresses = sesRaw.split(',').map((s) => s.trim()).filter(Boolean);

  // Compute previous month (YYYY-MM)
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);

  const dynamo = new DynamoDBClient({});
  const s3 = new S3Client({});

  console.log(`ReportingLambda: building monthly executive summary for ${prevMonth}…`);
  const reportData = await buildMonthlyExecutiveSummary(dynamo, tableName, s3, bucketName, prevMonth);

  console.log(`ReportingLambda: generating PDF for ${prevMonth}…`);
  const pdfBuffer = await generatePdf(reportData);

  if (toAddresses.length > 0) {
    await sendMonthlyViaSes(reportData, pdfBuffer, prevMonth, toAddresses, sesFromAddress).catch((err: unknown) => {
      console.error('ReportingLambda: monthly SES delivery failed', err);
    });
  } else {
    console.warn('ReportingLambda: SES_TO_ADDRESSES is empty — skipping monthly SES delivery');
  }

  console.log(`ReportingLambda: monthly executive summary delivery complete for ${prevMonth}`);
}
