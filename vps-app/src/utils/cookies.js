/**
 * Gestion des cookies Facebook — support multi-format
 *
 * Formats acceptés en entrée (auto-détectés) :
 *   1. Netscape cookies.txt          (# Netscape HTTP Cookie File ...)
 *   2. JSON array (EditThisCookie, Cookie-Editor, Get cookies.txt LOCALLY)
 *   3. Header string                 (c_user=xxx; xs=yyy; datr=zzz)
 *   4. cURL header (-H "Cookie: ...")
 *   5. Un seul objet JSON            ({ "cookies": [...] })
 *
 * Toujours converti et stocké au format Netscape (cookies.txt) —
 * c'est le seul format que yt-dlp comprend nativement via --cookies.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FB_DOMAINS = ['.facebook.com', '.fb.com', '.messenger.com'];

function cookiesFilePath() {
  return config.cookiesFile;
}

function cookiesFileExists() {
  try {
    return fs.existsSync(cookiesFilePath()) && fs.statSync(cookiesFilePath()).size > 0;
  } catch {
    return false;
  }
}

function cookiesFileInfo() {
  const p = cookiesFilePath();
  if (!cookiesFileExists()) return { exists: false };
  const st = fs.statSync(p);
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n').filter((l) => l && !l.startsWith('#'));
  const now = Math.floor(Date.now() / 1000);
  let expired = 0;
  let essential = { c_user: false, xs: false };
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [, , , , expires, name] = parts;
    const exp = parseInt(expires, 10);
    if (exp > 0 && exp < now) expired++;
    if (name === 'c_user') essential.c_user = true;
    if (name === 'xs') essential.xs = true;
  }
  return {
    exists: true,
    path: p,
    size: st.size,
    modified: st.mtime.toISOString(),
    cookieCount: lines.length,
    expired,
    hasSessionCookies: essential.c_user && essential.xs,
  };
}

/**
 * Détecte le format et retourne un tableau de cookies normalisés :
 *   { domain, name, value, path, expires, secure, httpOnly }
 */
function parseAnyFormat(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Contenu vide.');
  }
  const trimmed = input.trim();

  // 1. Netscape (déjà bon format)
  if (
    trimmed.startsWith('# Netscape HTTP Cookie File') ||
    trimmed.startsWith('# HTTP Cookie File') ||
    /^\.?[a-z0-9.-]+\.(com|net|org)\t(TRUE|FALSE)\t/im.test(trimmed)
  ) {
    return parseNetscape(trimmed);
  }

  // 2. JSON (array ou { cookies: [...] })
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      throw new Error('JSON invalide : ' + e.message);
    }
    const arr = Array.isArray(json) ? json : json.cookies || json.Cookies;
    if (!Array.isArray(arr)) {
      throw new Error('Format JSON non reconnu (attendu : tableau de cookies).');
    }
    return arr.map(normalizeJsonCookie).filter(Boolean);
  }

  // 3. Header string : "name=value; name2=value2"
  //    ou "Cookie: name=value; ..."
  if (trimmed.includes('=') && (trimmed.includes(';') || /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(trimmed))) {
    return parseHeaderString(trimmed);
  }

  throw new Error('Format de cookies non reconnu.');
}

function parseNetscape(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domain, includeSub, cookiePath, secure, expires, name, value] = parts;
    out.push({
      domain,
      includeSubdomains: includeSub === 'TRUE',
      path: cookiePath || '/',
      secure: secure === 'TRUE',
      expires: parseInt(expires, 10) || 0,
      name,
      value,
    });
  }
  return out;
}

function normalizeJsonCookie(c) {
  if (!c || !c.name) return null;
  let domain = c.domain || c.Domain || '';
  if (!domain) domain = '.facebook.com';
  if (!domain.startsWith('.') && !domain.startsWith('www')) domain = '.' + domain;
  // expirationDate (EditThisCookie), expires (Cookie-Editor), expiry (Playwright)
  let expires = c.expirationDate ?? c.expires ?? c.expiry ?? c.Expires ?? 0;
  if (typeof expires === 'string') expires = Date.parse(expires) / 1000 || 0;
  expires = Math.floor(Number(expires) || 0);
  return {
    domain,
    includeSubdomains: domain.startsWith('.'),
    path: c.path || c.Path || '/',
    secure: !!(c.secure || c.Secure),
    expires,
    name: c.name || c.Name,
    value: String(c.value ?? c.Value ?? ''),
  };
}

function parseHeaderString(text) {
  // Retire "Cookie:" éventuel
  let s = text.replace(/^Cookie:\s*/i, '').replace(/^-H\s+["']Cookie:\s*/i, '').replace(/["']$/, '');
  const oneYear = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const out = [];
  for (const pair of s.split(/;\s*/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    out.push({
      domain: '.facebook.com',
      includeSubdomains: true,
      path: '/',
      secure: true,
      expires: oneYear,
      name,
      value,
    });
  }
  return out;
}

/**
 * Convertit un tableau de cookies normalisés en format Netscape.
 */
function toNetscape(cookies) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# Generated by FBDown Pro',
    '# https://curl.se/docs/http-cookies.html',
    '',
  ];
  for (const c of cookies) {
    if (!c.name) continue;
    const domain = c.domain || '.facebook.com';
    lines.push(
      [
        domain,
        c.includeSubdomains ? 'TRUE' : 'FALSE',
        c.path || '/',
        c.secure ? 'TRUE' : 'FALSE',
        c.expires || 0,
        c.name,
        c.value ?? '',
      ].join('\t')
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Enregistre les cookies (n'importe quel format en entrée).
 * Retourne les infos sur le fichier écrit.
 */
function saveCookies(rawInput) {
  const parsed = parseAnyFormat(rawInput);
  if (!parsed.length) throw new Error('Aucun cookie valide trouvé.');

  // Filtre Facebook uniquement pour éviter les fuites
  const fbCookies = parsed.filter((c) =>
    FB_DOMAINS.some((d) => (c.domain || '').includes(d.replace(/^\./, '')))
  );
  if (!fbCookies.length) {
    throw new Error('Aucun cookie Facebook trouvé (domaines attendus : facebook.com, fb.com).');
  }

  const text = toNetscape(fbCookies);
  const p = cookiesFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {}
  return { ...cookiesFileInfo(), imported: fbCookies.length };
}

function deleteCookies() {
  const p = cookiesFilePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { ok: true };
}

/**
 * Argument yt-dlp à ajouter si un fichier cookies valide existe.
 */
function ytdlpCookieArgs() {
  return cookiesFileExists() ? ['--cookies', cookiesFilePath()] : [];
}

module.exports = {
  cookiesFilePath,
  cookiesFileExists,
  cookiesFileInfo,
  saveCookies,
  deleteCookies,
  ytdlpCookieArgs,
  parseAnyFormat, // exposé pour tests
};
