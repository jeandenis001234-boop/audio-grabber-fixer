const express = require('express');
const rateLimit = require('express-rate-limit');
const { isFacebookUrl, getVideoInfo, streamDownload } = require('../utils/ytdlp');
const { db } = require('../db');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

const infoLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' },
});
const downloadLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.downloadMax,
  message: { error: 'Limite de téléchargement atteinte. Réessayez plus tard.' },
});

function isBlacklisted(ip) {
  const row = db.prepare('SELECT 1 FROM blacklist_ips WHERE ip = ?').get(ip);
  return !!row;
}

// GET /api/info?url=...
router.get('/info', infoLimiter, async (req, res) => {
  const url = (req.query.url || '').toString().trim();
  const ip = req.ip;

  if (isBlacklisted(ip)) return res.status(403).json({ error: 'Accès refusé.' });
  if (!isFacebookUrl(url)) {
    return res.status(400).json({ error: 'URL Facebook invalide.' });
  }

  try {
    const info = await getVideoInfo(url);
    res.json({ ok: true, ...info });
  } catch (e) {
    logger.error('getVideoInfo:', e.message);
    res.status(500).json({ error: 'Impossible de récupérer les infos de la vidéo.' });
  }
});

// GET /api/download?url=...&format=mp4&quality=720p
router.get('/download', downloadLimiter, (req, res) => {
  const url = (req.query.url || '').toString().trim();
  const format = (req.query.format || 'mp4').toString().toLowerCase();
  const quality = (req.query.quality || '720p').toString();
  const ip = req.ip;

  if (isBlacklisted(ip)) return res.status(403).json({ error: 'Accès refusé.' });
  if (!isFacebookUrl(url)) {
    return res.status(400).json({ error: 'URL Facebook invalide.' });
  }
  if (!['mp4', 'mp3'].includes(format)) {
    return res.status(400).json({ error: 'Format non supporté. Utilisez mp4 ou mp3.' });
  }

  const startedAt = Date.now();
  const dlId = db
    .prepare(
      'INSERT INTO downloads (url, format, quality, ip, user_agent, status) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(url, format, quality, ip, req.headers['user-agent'] || '', 'started').lastInsertRowid;

  const filename = `fbdown-${Date.now()}.${format}`;
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  streamDownload({
    url,
    format,
    quality,
    res,
    onEnd: ({ ok, error }) => {
      db.prepare(
        'UPDATE downloads SET status = ?, error_message = ?, duration_ms = ? WHERE id = ?'
      ).run(ok ? 'success' : 'failed', error || null, Date.now() - startedAt, dlId);
    },
  });
});

// GET /api/health
router.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

module.exports = router;
