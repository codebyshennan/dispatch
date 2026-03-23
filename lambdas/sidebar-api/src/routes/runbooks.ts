import { Hono } from 'hono';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({});

export const runbooksRouter = new Hono();

runbooksRouter.post('/:runbookId', async (c) => {
  const runbookId = c.req.param('runbookId');
  const body = await c.req.json<{ ticketId: string; agentId?: string; params: Record<string, unknown> }>();

  const functionName = process.env.RUNBOOK_EXECUTOR_FUNCTION_NAME;
  if (!functionName) {
    return c.json({ error: 'RUNBOOK_EXECUTOR_FUNCTION_NAME not configured' }, 500);
  }

  const validRunbookIds = ['payment_status', 'transaction_search', 'kyc_status', 'card_freeze', 'resend_notification', 'escalate', 'stablecoin_tracker'];
  if (!validRunbookIds.includes(runbookId)) {
    return c.json({ error: `Unknown runbook: ${runbookId}` }, 400);
  }

  try {
    const invokeResult = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        runbookId,
        ticketId: body.ticketId,
        agentId: body.agentId,
        params: body.params ?? {},
      }),
    }));

    if (invokeResult.FunctionError) {
      const errorPayload = invokeResult.Payload
        ? JSON.parse(Buffer.from(invokeResult.Payload).toString())
        : {};
      return c.json({ error: errorPayload.errorMessage ?? 'Runbook Lambda error' }, 502);
    }

    const result = invokeResult.Payload
      ? JSON.parse(Buffer.from(invokeResult.Payload).toString())
      : {};

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});
