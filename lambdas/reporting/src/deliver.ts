import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { IncomingWebhook } from '@slack/webhook';
import type { ReportData } from './weekly.js';

// ---------------------------------------------------------------------------
// HTML email builder
// ---------------------------------------------------------------------------

function buildHtmlEmail(report: ReportData): string {
  const { weekOf, ticketVolume, automationRate, reContactTrend, kbGaps, vocSummary, promptPerformance, generatedAt } = report;

  const categoryRows = Object.entries(ticketVolume.byCategory)
    .map(([cat, count]) => `<tr><td style="padding:4px 8px;">${cat}</td><td style="padding:4px 8px; text-align:right;">${count}</td></tr>`)
    .join('\n');

  const reContactRows = Object.entries(reContactTrend.perCategoryRates)
    .map(([cat, rate]) => `<tr><td style="padding:4px 8px;">${cat}</td><td style="padding:4px 8px; text-align:right;">${(rate * 100).toFixed(1)}%</td></tr>`)
    .join('\n');

  const kbGapItems = kbGaps.gaps.length > 0
    ? kbGaps.gaps.map((g) => `<li><strong>${g.category}</strong>: ${g.gapDescription}</li>`).join('\n')
    : '<li>No gaps detected this week</li>';

  const vocRows = vocSummary.platforms
    .map((p) => `<tr><td style="padding:4px 8px;">${p.platform}</td><td style="padding:4px 8px; text-align:right;">${p.averageRating.toFixed(2)}</td><td style="padding:4px 8px; text-align:right;">${p.oneStarCount}</td><td style="padding:4px 8px; text-align:right;">${p.totalCount}</td></tr>`)
    .join('\n');

  const promptRows = promptPerformance.rows.length > 0
    ? promptPerformance.rows.map((r) => `<tr><td style="padding:4px 8px;">${r.category}</td><td style="padding:4px 8px; text-align:right;">${r.accuracy.toFixed(1)}%</td><td style="padding:4px 8px; text-align:right;">${(r.meanEditDistance * 100).toFixed(1)}%</td><td style="padding:4px 8px; text-align:right;">${(r.complianceFlagRate * 100).toFixed(1)}%</td><td style="padding:4px 8px; text-align:right;">${r.sampleSize}</td></tr>`).join('\n')
    : '<tr><td colspan="5" style="padding:4px 8px; color:#888;">No prompt performance data this week</td></tr>';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Weekly CX Report — ${weekOf}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 22px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">
    Weekly CX Report — Week of ${weekOf}
  </h1>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">1. Ticket Volume</h2>
  <p><strong>Total tickets (last 7 days):</strong> ${ticketVolume.total}</p>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding:6px 8px; text-align:left;">Category</th>
        <th style="padding:6px 8px; text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>${categoryRows}</tbody>
  </table>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">2. Automation Rate</h2>
  <p>
    <strong>${automationRate.automationRate.toFixed(1)}%</strong> auto-accepted
    (${automationRate.autoAccepted} of ${automationRate.totalSent} sent drafts with &lt;20% edit distance)
  </p>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">3. Re-contact Trend by Category</h2>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding:6px 8px; text-align:left;">Category</th>
        <th style="padding:6px 8px; text-align:right;">Re-contact Rate</th>
      </tr>
    </thead>
    <tbody>${reContactRows || '<tr><td colspan="2" style="padding:4px 8px; color:#888;">No data</td></tr>'}</tbody>
  </table>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">4. KB Gaps</h2>
  <ul style="font-size: 14px; line-height: 1.6;">${kbGapItems}</ul>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">5. VoC Summary</h2>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding:6px 8px; text-align:left;">Platform</th>
        <th style="padding:6px 8px; text-align:right;">Avg Rating</th>
        <th style="padding:6px 8px; text-align:right;">1-star (7d)</th>
        <th style="padding:6px 8px; text-align:right;">Total (7d)</th>
      </tr>
    </thead>
    <tbody>${vocRows}</tbody>
  </table>

  <h2 style="font-size: 16px; color: #374151; margin-top: 24px;">6. Prompt Performance (EVAL-07)</h2>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding:6px 8px; text-align:left;">Category</th>
        <th style="padding:6px 8px; text-align:right;">Accuracy</th>
        <th style="padding:6px 8px; text-align:right;">Mean Edit Dist.</th>
        <th style="padding:6px 8px; text-align:right;">Compliance Flag Rate</th>
        <th style="padding:6px 8px; text-align:right;">Sample Size</th>
      </tr>
    </thead>
    <tbody>${promptRows}</tbody>
  </table>

  <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #9ca3af;">Generated at ${generatedAt} by Meridian ReportingLambda</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// SES v2 delivery
// ---------------------------------------------------------------------------

export async function sendViaSes(
  report: ReportData,
  toAddresses: string[],
  fromAddress: string,
): Promise<void> {
  const ses = new SESv2Client({});
  const htmlBody = buildHtmlEmail(report);
  const subject = `Weekly CX Report — Week of ${report.weekOf}`;

  await ses.send(new SendEmailCommand({
    FromEmailAddress: fromAddress,
    Destination: {
      ToAddresses: toAddresses,
    },
    Content: {
      Simple: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
        },
      },
    },
  }));
}

// ---------------------------------------------------------------------------
// Slack Block Kit delivery
// ---------------------------------------------------------------------------

export async function sendViaSlack(
  report: ReportData,
  webhookUrl: string,
): Promise<void> {
  const webhook = new IncomingWebhook(webhookUrl);

  const { weekOf, ticketVolume, automationRate, vocSummary } = report;

  // Compute overall average VoC rating across all platforms
  const totalVocReviews = vocSummary.platforms.reduce((sum, p) => sum + p.totalCount, 0);
  const weightedRating = totalVocReviews > 0
    ? vocSummary.platforms.reduce((sum, p) => sum + p.averageRating * p.totalCount, 0) / totalVocReviews
    : 0;

  await webhook.send({
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Weekly CX Report — ${weekOf}`,
          emoji: false,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Tickets (7d)*\n${ticketVolume.total}`,
          },
          {
            type: 'mrkdwn',
            text: `*Automation Rate*\n${automationRate.automationRate.toFixed(1)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Avg VoC Rating*\n${weightedRating > 0 ? weightedRating.toFixed(2) : 'N/A'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Drafts Sent*\n${automationRate.totalSent}`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Generated by Meridian ReportingLambda at ${report.generatedAt}`,
          },
        ],
      },
    ],
  });
}
