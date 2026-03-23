import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { runEval } from './runner.js';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/eval/run', async (c) => {
  const body = await c.req.json<{ prompt?: string; dataset?: string; threshold?: number }>();

  if (!body.prompt || !body.dataset) {
    return c.json({ error: 'prompt and dataset are required' }, 400);
  }

  const threshold = body.threshold ?? 85;

  try {
    const output = await runEval({
      promptName: body.prompt,
      datasetName: body.dataset,
      threshold,
    });
    const passed = parseFloat(output.summary.accuracy) >= threshold;
    return c.json({ ...output, passed }, passed ? 200 : 422);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

export const handler = handle(app);
