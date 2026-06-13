import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';

const router = Router();

const rowToProject = (r) => ({
  id: r.id,
  title: r.title,
  status: r.status,
  duration: r.duration,
  format: r.format,
  thumbnail: r.thumbnail,
  story: safeParse(r.story_json),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function upsert(id, body) {
  const now = Date.now();
  const b = body || {};
  const story = b.story || {};
  const existing = db.prepare('SELECT created_at FROM projects WHERE id = ?').get(id);
  const payload = {
    id,
    title: b.title || story.title || 'Sem título',
    status: b.status || 'draft',
    duration: Number(b.duration) || 0,
    format: b.format || '1080x1920',
    thumbnail: b.thumbnail || null,
    story_json: JSON.stringify(story),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO projects (id,title,status,duration,format,thumbnail,story_json,created_at,updated_at)
     VALUES (@id,@title,@status,@duration,@format,@thumbnail,@story_json,@created_at,@updated_at)
     ON CONFLICT(id) DO UPDATE SET
       title=@title,status=@status,duration=@duration,format=@format,
       thumbnail=@thumbnail,story_json=@story_json,updated_at=@updated_at`
  ).run(payload);
  return id;
}

// List (lightweight — omits full story_json)
router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id,title,status,duration,format,thumbnail,created_at,updated_at FROM projects ORDER BY updated_at DESC')
    .all();
  res.json({
    projects: rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, duration: r.duration,
      format: r.format, thumbnail: r.thumbnail, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'não encontrado' });
  res.json({ project: rowToProject(row) });
});

router.post('/', (req, res) => {
  const id = nanoid();
  upsert(id, req.body);
  res.json({ ok: true, id });
});

router.put('/:id', (req, res) => {
  upsert(req.params.id, req.body);
  res.json({ ok: true, id: req.params.id });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
