import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { contextRouter } from './routes/context.js';
import { feedbackRouter } from './routes/feedback.js';
import { telemetryRouter } from './routes/telemetry.js';
import { runbooksRouter } from './routes/runbooks.js';
import { sendRouter } from './routes/send.js';
import { modeRouter } from './routes/mode.js';
import { vocRouter } from './routes/voc.js';
import { npsRouter } from './routes/nps.js';

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
app.route('/send', sendRouter);
app.route('/mode', modeRouter);
app.route('/voc', vocRouter);
app.route('/nps', npsRouter);

app.get('/health', (c) => c.json({ status: 'ok' }));

export const handler = handle(app);
