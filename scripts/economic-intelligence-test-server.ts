import express from 'express';
import { economicIntelligenceRouter } from '../src/http/routes/economicIntelligence.js';

const port = Number(process.env.PORT ?? 8791);
const app = express();
app.use(express.json({ limit: '64kb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/economic-intelligence', economicIntelligenceRouter);
app.listen(port, '127.0.0.1', () => {
  console.log(`economic-intelligence proof server listening on ${port}`);
});
