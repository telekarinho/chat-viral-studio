import { Router } from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, '../../data/media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const upload = multer({ dest: MEDIA_DIR, limits: { fileSize: 200 * 1024 * 1024 } });
const router = Router();

const SIZES = {
  '1080x1920': { w: 1080, h: 1920 },
  '720x1280': { w: 720, h: 1280 },
  '2160x3840': { w: 2160, h: 3840 }, // 4K opcional
};

// Receives the WebM recorded in the browser (canvas + audio) and transcodes to MP4 H.264/AAC.
router.post('/render', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'arquivo "video" ausente' });
    const format = SIZES[req.body.format] ? req.body.format : '1080x1920';
    const { w, h } = SIZES[format];

    const inPath = req.file.path;
    const outName = `cvs_${nanoid(8)}.mp4`;
    const outPath = path.join(MEDIA_DIR, outName);
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

    const args = [
      '-y',
      '-i', inPath,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      outPath,
    ];

    const proc = spawn(ffmpeg, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => {
      cleanup(inPath);
      next(Object.assign(new Error(`FFmpeg não encontrado (${e.message}). Instale o ffmpeg ou ajuste FFMPEG_PATH.`), { status: 500 }));
    });
    proc.on('close', (code) => {
      cleanup(inPath);
      if (code !== 0) {
        return next(Object.assign(new Error(`FFmpeg falhou (code ${code}): ${stderr.slice(-400)}`), { status: 500 }));
      }
      res.json({ url: `/media/${outName}`, format, size: fs.statSync(outPath).size });
    });
  } catch (err) {
    next(err);
  }
});

export default router;

function cleanup(p) {
  fs.promises.unlink(p).catch(() => {});
}
