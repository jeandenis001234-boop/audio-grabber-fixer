const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM downloads').get().c;
  const success = db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE status = 'success'").get().c;
  const failed = db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE status = 'failed'").get().c;
  const today = db.prepare(
    "SELECT COUNT(*) AS c FROM downloads WHERE date(created_at) = date('now')"
  ).get().c;
  const last7days = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count
    FROM downloads
    WHERE created_at >= date('now', '-7 days')
    GROUP BY day ORDER BY day
  `).all();
  const byFormat = db.prepare(`
    SELECT format, COUNT(*) AS count FROM downloads GROUP BY format
  `).all();
  const topIps = db.prepare(`
    SELECT ip, COUNT(*) AS count FROM downloads
    GROUP BY ip ORDER BY count DESC LIMIT 10
  `).all();

  res.json({ total, success, failed, today, last7days, byFormat, topIps });
});

// Logs de téléchargement (paginés)
router.get('/downloads', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = (page - 1) * limit;
  const rows = db
    .prepare('SELECT * FROM downloads ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS c FROM downloads').get().c;
  res.json({ rows, total, page, limit });
});

router.delete('/downloads/:id', (req, res) => {
  db.prepare('DELETE FROM downloads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/downloads/clear', (req, res) => {
  db.prepare('DELETE FROM downloads').run();
  res.json({ ok: true });
});

// Blacklist
router.get('/blacklist', (req, res) => {
  res.json({ rows: db.prepare('SELECT * FROM blacklist_ips ORDER BY created_at DESC').all() });
});
router.post('/blacklist', (req, res) => {
  const { ip, reason } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP requise.' });
  db.prepare('INSERT OR REPLACE INTO blacklist_ips (ip, reason) VALUES (?, ?)').run(ip, reason || '');
  res.json({ ok: true });
});
router.delete('/blacklist/:ip', (req, res) => {
  db.prepare('DELETE FROM blacklist_ips WHERE ip = ?').run(req.params.ip);
  res.json({ ok: true });
});

// Settings clé/valeur
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json(obj);
});
router.post('/settings', (req, res) => {
  const entries = Object.entries(req.body || {});
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((es) => es.forEach(([k, v]) => stmt.run(k, String(v))));
  tx(entries);
  res.json({ ok: true });
});

// Changer mot de passe admin
router.post('/change-password', async (req, res) => {
  const { current, next: newPass } = req.body || {};
  if (!current || !newPass || newPass.length < 8) {
    return res.status(400).json({ error: 'Mot de passe requis (min 8 caractères).' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  const hash = await bcrypt.hash(newPass, 12);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, req.admin.id);
  res.json({ ok: true });
});

// Liste admins
router.get('/admins', (req, res) => {
  res.json({
    rows: db.prepare('SELECT id, username, email, role, created_at, last_login FROM admin_users').all(),
  });
});

router.post('/admins', async (req, res) => {
  const { username, email, password, role } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Champs invalides.' });
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    db.prepare(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(username, email || '', hash, role || 'admin');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Nom d\'utilisateur déjà pris.' });
  }
});

router.delete('/admins/:id', (req, res) => {
  if (parseInt(req.params.id, 10) === req.admin.id) {
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte.' });
  }
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
