/**
 * FBDown Pro — Facebook Video Downloader
 * Serveur principal Express : API + site public + panel admin
 */
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./src/config');
const { initDb } = require('./src/db');
const apiRoutes = require('./src/routes/api');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const logger = require('./src/utils/logger');

const app = express();

// --- Sécurité & middlewares globaux ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", 'https://pagead2.googlesyndication.com', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'https://www.google-analytics.com'],
        'frame-src': ["'self'", 'https://googleads.g.doubleclick.net'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('tiny'));

// Injecte les variables SEO/pub dans les pages HTML servies
app.use((req, res, next) => {
  res.locals = {
    siteName: config.siteName,
    siteDescription: config.siteDescription,
    adsenseClient: config.adsenseClient,
    gaId: config.gaId,
    publicUrl: config.publicUrl,
  };
  next();
});

// --- Init DB ---
initDb();

// --- Routes API ---
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);

if (config.adminPanelEnabled) {
  app.use('/api/admin', adminRoutes);
  app.use('/admin', express.static(path.join(__dirname, 'admin')));
  // SPA-style fallback pour /admin/*
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  });
}

// --- Site public ---
if (config.webpanelEnabled) {
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
}

// --- 404 ---
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint introuvable.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).send('404 — Page introuvable');
  });
});

// --- Handler d'erreurs ---
app.use((err, req, res, next) => {
  logger.error('Erreur non gérée:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur interne du serveur.',
  });
});

app.listen(config.port, () => {
  logger.info(`🚀 FBDown Pro démarré sur le port ${config.port}`);
  logger.info(`   Site public   : ${config.webpanelEnabled ? '✓ activé' : '✗ désactivé'}`);
  logger.info(`   Panel admin   : ${config.adminPanelEnabled ? '✓ activé sur /admin' : '✗ désactivé'}`);
  logger.info(`   URL publique  : ${config.publicUrl}`);
});
