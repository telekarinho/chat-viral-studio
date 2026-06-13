import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import generateRouter from './routes/generate.js';
import ttsRouter from './routes/tts.js';
import renderRouter from './routes/render.js';
import projectsRouter from './routes/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, '../data/media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));
app.use(express.json({ limit: '12mb' }));

// Serve rendered videos / media
app.use('/media', express.static(MEDIA_DIR));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    name: 'chat-viral-studio',
    gemini: Boolean(process.env.GEMINI_API_KEY),
    tts: Boolean(process.env.GOOGLE_TTS_API_KEY),
  })
);

app.use('/api', generateRouter);
app.use('/api', ttsRouter);
app.use('/api', renderRouter);
app.use('/api/projects', projectsRouter);

// Central error handler — never leak stack to client in prod
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  🎬 Chat Viral Studio API  →  http://localhost:${PORT}`);
  console.log(`     Gemini: ${process.env.GEMINI_API_KEY ? 'live' : 'mock'}  |  TTS: ${process.env.GOOGLE_TTS_API_KEY ? 'live' : 'beep'}\n`);
});
