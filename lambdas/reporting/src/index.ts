import { buildWeeklyCxReport } from './weekly.js';
import { sendViaSes, sendViaSlack } from './deliver.js';

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
