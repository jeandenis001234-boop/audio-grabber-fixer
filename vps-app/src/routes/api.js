const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
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

// POST /api/analyze — Compat avec le bot Telegram et l'ancienne API.
// Renvoie des URLs qui pointent vers /api/download (merge audio+vidéo via ffmpeg),
// et non plus les URLs DASH brutes de yt-dlp (qui étaient muettes).
router.post('/analyze', infoLimiter, express.json({ limit: '1mb' }), async (req, res) => {
  const url = (req.body?.url || '').toString().trim();
  const ip = req.ip;

  if (isBlacklisted(ip)) return res.status(403).json({ error: 'Accès refusé.' });
  if (!isFacebookUrl(url)) {
    return res.status(400).json({ error: 'URL Facebook invalide (facebook.com ou fb.watch).' });
  }

  try {
    const info = await getVideoInfo(url);
    const base = config.publicUrl.replace(/\/$/, '');
    const enc = encodeURIComponent(url);
    const formats = (info.formats.qualities || []).map((q) => ({
      formatId: q.quality,
      label: q.quality,
      height: q.height,
      ext: 'mp4',
      url: `${base}/api/download?url=${enc}&format=mp4&quality=${q.quality}`,
      acodec: 'aac',
      vcodec: 'h264',
      filesize: null,
    }));
    // Ajoute une entrée MP3 en bonus
    formats.push({
      formatId: 'mp3-320',
      label: 'MP3 320k',
      height: 0,
      ext: 'mp3',
      url: `${base}/api/download?url=${enc}&format=mp3&quality=320`,
      acodec: 'mp3',
      vcodec: 'none',
      filesize: null,
    });

    res.json({
      success: true,
      metadata: {
        id: info.raw_id || null,
        title: info.title,
        description: null,
        thumbnail: info.thumbnail || null,
        viewCount: null,
        likeCount: null,
        uploadDate: null,
        uploader: info.uploader || null,
        duration: info.duration || null,
        formats,
        comments: [],
      },
    });
  } catch (e) {
    logger.error('analyze:', e.message);
    res.status(502).json({ error: 'Extraction impossible. Vérifiez le lien.' });
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
router.get('/health', (req, res) => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  res.json({
    ok: true,
    uptime: process.uptime(),
    webpanelEnabled: config.webpanelEnabled,
    adminPanelEnabled: config.adminPanelEnabled,
    assets: {
      css: fs.existsSync(path.join(publicDir, 'css', 'style.css')),
      js: fs.existsSync(path.join(publicDir, 'js', 'app.js')),
      home: fs.existsSync(path.join(publicDir, 'index.html')),
    },
  });
});

module.exports = router;
