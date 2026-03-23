import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfnClient = new SFNClient({});

interface SQSRecord {
  body: string;
  messageId: string;
}

interface SQSEvent {
  Records: SQSRecord[];
}

export async function handler(event: SQSEvent) {
  const stateMachineArn = process.env.STATE_MACHINE_ARN!;
  const results: { itemIdentifier?: string }[] = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body) as Record<string, unknown>;
      const detail = body.detail as Record<string, unknown> | undefined;
      const ticket = detail?.ticket as Record<string, unknown> | undefined;

      if (!ticket) {
        console.error(`Missing ticket in SQS message: ${record.messageId}`);
        continue;
      }

      await sfnClient.send(new StartExecutionCommand({
        stateMachineArn,
        input: JSON.stringify({
          ticketId: String(ticket.id ?? ''),
          subject: String(ticket.subject ?? ''),
          body: String(ticket.description ?? ticket.body ?? ''),
          requesterEmail: ticket.requester_email as string | undefined,
        }),
      }));
    } catch (err) {
      console.error(`Failed to start execution for ${record.messageId}:`, err);
      // Report as failed so SQS retries / routes to DLQ
      results.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: results };
}
