'use strict';

/**
 * DOWFBAPI – Telegram Bot
 * Connects to the local /api/analyze endpoint and lets users
 * download Facebook videos directly from Telegram.
 *
 * User commands:
 *   /start  – Welcome message
 *   /help   – Command list
 *   (send any facebook.com / fb.watch URL) – analyse & show download links
 *
 * Admin commands (ADMIN_ID only):
 *   /stats      – Usage statistics
 *   /broadcast  – Send a message to every registered user
 *   /ban <id>   – Ban a user
 *   /unban <id> – Unban a user
 *   /logs       – Show last 20 log lines
 *   /restart    – Restart the API server via PM2
 */

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, '..', 'bot-config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[bot] bot-config.json not found. Run the "fb" menu → option 5 to configure the bot.');
  process.exit(1);
}

const config   = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const TOKEN    = config.token;
const ADMIN_ID = Number(config.adminId);
const API_BASE = (config.apiUrl || 'http://localhost:3000').replace(/\/$/, '');

if (!TOKEN || !ADMIN_ID) {
  console.error('[bot] Missing token or adminId in bot-config.json.');
  process.exit(1);
}

// Request timeout for the local API call (slightly above the server's own yt-dlp timeout)
const API_REQUEST_TIMEOUT_MS = 70000;
const DATA_DIR  = path.join(__dirname, '..', 'data');
const USERS_DB  = path.join(DATA_DIR, 'users.json');
const STATS_DB  = path.join(DATA_DIR, 'stats.json');

function loadJson(filePath, defaults) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaults;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// users: { [id]: { id, username, firstName, banned, joinedAt } }
let users = loadJson(USERS_DB, {});
// stats: { totalRequests, totalDownloads }
let stats = loadJson(STATS_DB, { totalRequests: 0, totalDownloads: 0 });

function persistUsers() { saveJson(USERS_DB, users); }
function persistStats() { saveJson(STATS_DB, stats); }

function registerUser(msg) {
  const id = String(msg.from.id);
  if (!users[id]) {
    users[id] = {
      id:        msg.from.id,
      username:  msg.from.username || null,
      firstName: msg.from.first_name || '',
      banned:    false,
      joinedAt:  new Date().toISOString(),
    };
    persistUsers();
  }
}

function isBanned(userId) {
  const u = users[String(userId)];
  return u ? u.banned : false;
}

function isAdmin(userId) {
  return Number(userId) === ADMIN_ID;
}

// ── Telegram Bot ──────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('[bot] Bot started, polling Telegram…');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Call POST /api/analyze on the local server.
 * Returns parsed JSON or throws.
 */
function analyzeUrl(fbUrl) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ url: fbUrl });
    const parsedBase = new URL(API_BASE);
    const isHttps = parsedBase.protocol === 'https:';
    const options = {
      hostname: parsedBase.hostname,
      port:     parsedBase.port || (isHttps ? 443 : 80),
      path:     '/api/analyze',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const lib = isHttps ? https : http;
    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON from API'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(API_REQUEST_TIMEOUT_MS, () => { req.destroy(new Error('API request timed out')); });
    req.write(body);
    req.end();
  });
}

function isFacebookUrl(text) {
  try {
    const { hostname } = new URL(text.trim());
    return /^(www\.|m\.|web\.)?facebook\.com$/.test(hostname) ||
           /^(www\.)?fb\.watch$/.test(hostname);
  } catch {
    return false;
  }
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function escape(text) {
  // Replace each MarkdownV2 special character with its escaped version.
  // Using '$&' in the replacement string is unambiguous (no template-literal
  // backslash-escaping confusion).
  return String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── User Commands ─────────────────────────────────────────────────────────────

bot.onText(/^\/start$/, msg => {
  registerUser(msg);
  if (isBanned(msg.from.id)) return;

  const name = msg.from.first_name || 'there';
  bot.sendMessage(msg.chat.id,
    `👋 *Bienvenue ${escape(name)}\\!*\n\n` +
    `🎬 Je suis le bot de téléchargement de vidéos Facebook\\.\n\n` +
    `📌 *Comment utiliser:*\n` +
    `Envoie\\-moi simplement un lien Facebook \\(facebook\\.com ou fb\\.watch\\) ` +
    `et je t\\'analyserai pour toi\\.\\n\n` +
    `Tape /help pour voir toutes les commandes\\.`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.onText(/^\/help$/, msg => {
  registerUser(msg);
  if (isBanned(msg.from.id)) return;

  let text =
    `📖 *Commandes disponibles:*\n\n` +
    `🔹 /start \\— Message de bienvenue\n` +
    `🔹 /help \\— Cette aide\n` +
    `🔹 *Envoie un lien Facebook* \\— Analyse \\& téléchargement\n\n` +
    `💡 Formats supportés: facebook\\.com, fb\\.watch`;

  if (isAdmin(msg.from.id)) {
    text +=
      `\n\n🔐 *Commandes Admin:*\n` +
      `🔸 /stats \\— Statistiques d\\'utilisation\n` +
      `🔸 /broadcast \\<message\\> \\— Diffuser un message\n` +
      `🔸 /ban \\<id\\> \\— Bannir un utilisateur\n` +
      `🔸 /unban \\<id\\> \\— Débannir un utilisateur\n` +
      `🔸 /logs \\— Derniers logs du bot\n` +
      `🔸 /restart \\— Redémarrer l\\'API`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'MarkdownV2' });
});

// ── Admin Commands ────────────────────────────────────────────────────────────

bot.onText(/^\/stats$/, msg => {
  if (!isAdmin(msg.from.id)) return;

  const total   = Object.keys(users).length;
  const banned  = Object.values(users).filter(u => u.banned).length;
  const active  = total - banned;

  bot.sendMessage(msg.chat.id,
    `📊 *Statistiques du bot*\n\n` +
    `👥 Utilisateurs total: *${total}*\n` +
    `✅ Actifs: *${active}*\n` +
    `🚫 Bannis: *${banned}*\n\n` +
    `📥 Requêtes d\\'analyse: *${stats.totalRequests}*\n` +
    `⬇️ Liens envoyés: *${stats.totalDownloads}*`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.onText(/^\/broadcast\s+(.+)$/s, async (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const text = match[1];
  const ids   = Object.values(users).filter(u => !u.banned).map(u => u.id);

  bot.sendMessage(msg.chat.id, `📡 Envoi en cours vers ${ids.length} utilisateurs…`);

  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      await bot.sendMessage(id, `📢 *Message de l\\'admin:*\n\n${escape(text)}`, { parse_mode: 'MarkdownV2' });
      ok++;
    } catch {
      fail++;
    }
  }
  bot.sendMessage(msg.chat.id, `✅ Broadcast terminé: ${ok} envoyés, ${fail} échoués.`);
});

bot.onText(/^\/ban (\d+)$/, msg => {
  if (!isAdmin(msg.from.id)) return;
  const targetId = msg.text.split(' ')[1];
  if (!users[targetId]) {
    return bot.sendMessage(msg.chat.id, `❌ Utilisateur ${targetId} introuvable.`);
  }
  users[targetId].banned = true;
  persistUsers();
  bot.sendMessage(msg.chat.id, `🚫 Utilisateur ${targetId} banni.`);
});

bot.onText(/^\/unban (\d+)$/, msg => {
  if (!isAdmin(msg.from.id)) return;
  const targetId = msg.text.split(' ')[1];
  if (!users[targetId]) {
    return bot.sendMessage(msg.chat.id, `❌ Utilisateur ${targetId} introuvable.`);
  }
  users[targetId].banned = false;
  persistUsers();
  bot.sendMessage(msg.chat.id, `✅ Utilisateur ${targetId} débanni.`);
});

bot.onText(/^\/logs$/, msg => {
  if (!isAdmin(msg.from.id)) return;
  const logFile = path.join(__dirname, '..', 'logs', 'bot-out.log');
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    // Sanitize: remove triple-backtick sequences to avoid breaking the code block
    const lines = content.trim().split('\n').slice(-20).join('\n')
      .replace(/```/g, "'''");
    bot.sendMessage(msg.chat.id, `📋 *Derniers logs:*\n\`\`\`\n${lines}\n\`\`\``, { parse_mode: 'MarkdownV2' });
  } catch {
    bot.sendMessage(msg.chat.id, '⚠️ Aucun fichier de log trouvé.');
  }
});

bot.onText(/^\/restart$/, msg => {
  if (!isAdmin(msg.from.id)) return;
  const { execFile } = require('child_process');
  bot.sendMessage(msg.chat.id, '🔄 Redémarrage de l\'API en cours…');
  execFile('pm2', ['restart', 'dowfbapi'], (err, stdout) => {
    if (err) {
      return bot.sendMessage(msg.chat.id, `❌ Erreur: ${err.message}`);
    }
    bot.sendMessage(msg.chat.id, `✅ API redémarrée.\n\`\`\`\n${stdout.trim()}\n\`\`\``, { parse_mode: 'MarkdownV2' });
  });
});

// ── URL Analysis (main feature) ───────────────────────────────────────────────

bot.on('message', async msg => {
  // Ignore commands
  if (!msg.text || msg.text.startsWith('/')) return;

  registerUser(msg);
  if (isBanned(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '🚫 Tu as été banni de ce bot.');
  }

  const text = msg.text.trim();

  // Extract first URL from the message
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch || !isFacebookUrl(urlMatch[0])) {
    return bot.sendMessage(msg.chat.id,
      '❓ Envoie\\-moi un lien Facebook valide \\(facebook\\.com ou fb\\.watch\\)\\.',
      { parse_mode: 'MarkdownV2' }
    );
  }

  const fbUrl = urlMatch[0];
  const waitMsg = await bot.sendMessage(msg.chat.id, '⏳ Analyse en cours…');

  stats.totalRequests++;
  persistStats();

  let result;
  try {
    result = await analyzeUrl(fbUrl);
  } catch (err) {
    await bot.editMessageText(`❌ Erreur: ${err.message}`, {
      chat_id:    msg.chat.id,
      message_id: waitMsg.message_id,
    });
    return;
  }

  if (!result.success || !result.metadata) {
    await bot.editMessageText(`❌ ${result.error || 'Échec de l\'analyse.'}`, {
      chat_id:    msg.chat.id,
      message_id: waitMsg.message_id,
    });
    return;
  }

  const meta = result.metadata;
  const title    = escape(meta.title    || 'Sans titre');
  const uploader = escape(meta.uploader || 'Inconnu');
  const views    = meta.viewCount ? meta.viewCount.toLocaleString('fr-FR') : 'N/A';
  const duration = escape(formatDuration(meta.duration));

  // Build inline keyboard: one button per format
  // Sanitize label and ext from the API to avoid unexpected characters in button text
  const keyboard = meta.formats.map(f => ([{
    text:          `⬇️ ${String(f.label || '').replace(/[^\w\s\-p]/g, '')} (${String(f.ext || 'mp4').replace(/[^\w]/g, '').toUpperCase()})`,
    callback_data: `dl:${f.formatId}:${msg.from.id}`,
    url:           f.url,   // direct link – opens in browser
  }]));

  // Include the post description/caption when available (truncated to 300 chars
  // to keep the Telegram caption readable and within limits).
  const descLine = meta.description
    ? `\n\n📝 ${escape(meta.description.slice(0, 300))}${meta.description.length > 300 ? '\\.\\.\\.' : ''}`
    : '';

  const caption =
    `🎬 *${title}*\n\n` +
    `👤 ${uploader}\n` +
    `👁️ ${escape(views)} vues\n` +
    `⏱️ Durée: ${duration}` +
    descLine +
    `\n\n🔽 *Choisissez une qualité:*`;

  try {
    // Send thumbnail if available
    if (meta.thumbnail) {
      await bot.deleteMessage(msg.chat.id, waitMsg.message_id).catch(() => {});
      await bot.sendPhoto(msg.chat.id, meta.thumbnail, {
        caption,
        parse_mode:   'MarkdownV2',
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      await bot.editMessageText(caption, {
        chat_id:      msg.chat.id,
        message_id:   waitMsg.message_id,
        parse_mode:   'MarkdownV2',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    stats.totalDownloads++;
    persistStats();
  } catch (err) {
    // Fallback: send as plain text if photo fails
    await bot.editMessageText(
      `🎬 *${title}*\n\n` +
      `👤 ${uploader}\n⏱️ ${duration}\n\n` +
      meta.formats.map(f => `▶️ [${f.label}](${f.url})`).join('\n'),
      {
        chat_id:    msg.chat.id,
        message_id: waitMsg.message_id,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      }
    ).catch(() => {});
  }
});

// Acknowledge inline button presses (buttons are URL-type, but handle errors gracefully)
bot.on('callback_query', query => {
  bot.answerCallbackQuery(query.id).catch(() => {});
});

// ── Error handling ────────────────────────────────────────────────────────────
bot.on('polling_error', err => {
  console.error('[bot] Polling error:', err.code, err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[bot] Unhandled rejection:', reason);
});
