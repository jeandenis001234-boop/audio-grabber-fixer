module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-change-me',

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  },

  webpanelEnabled: (process.env.WEBPANEL_ENABLED || 'true') === 'true',
  adminPanelEnabled: (process.env.ADMIN_PANEL_ENABLED || 'true') === 'true',

  adsenseClient: process.env.ADSENSE_CLIENT || '',
  gaId: process.env.GA_MEASUREMENT_ID || '',
  siteName: process.env.SITE_NAME || 'FBDown Pro',
  siteDescription:
    process.env.SITE_DESCRIPTION ||
    'Télécharger les vidéos Facebook en MP4 HD et MP3 gratuitement',

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    downloadMax: parseInt(process.env.DOWNLOAD_RATE_LIMIT_MAX || '20', 10),
  },

  ytdlpBin: process.env.YTDLP_BIN || 'yt-dlp',
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '300000', 10),
};
