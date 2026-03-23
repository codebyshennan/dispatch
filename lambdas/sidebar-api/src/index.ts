import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { contextRouter } from './routes/context.js';
import { feedbackRouter } from './routes/feedback.js';
import { telemetryRouter } from './routes/telemetry.js';
import { runbooksRouter } from './routes/runbooks.js';

const app = new Hono();

// CORS required for Zendesk proxy (client.request() routes via Zendesk's proxy servers)
app.use('*', cors({
  origin: ['https://*.zendesk.com', 'https://*.zdassets.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.route('/context', contextRouter);
app.route('/feedback', feedbackRouter);
app.route('/telemetry', telemetryRouter);
app.route('/runbooks', runbooksRouter);

app.get('/health', (c) => c.json({ status: 'ok' }));

export const handler = handle(app);
