const { spawn } = require('child_process');
const config = require('../config');
const logger = require('./logger');

const FB_URL_REGEX = /^https?:\/\/(www\.|web\.|m\.|mbasic\.|business\.)?(facebook|fb)\.(com|watch)\/[^\s]+$/i;

function isFacebookUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return FB_URL_REGEX.test(url.trim());
}

/**
 * Récupère les métadonnées d'une vidéo Facebook (titre, formats, thumbnail)
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--dump-single-json',
      '--no-check-certificates',
      url,
    ];
    const proc = spawn(config.ytdlpBin, args, { timeout: 30000 });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `yt-dlp exit ${code}`));
      try {
        const info = JSON.parse(out);
        resolve({
          title: info.title || 'Vidéo Facebook',
          thumbnail: info.thumbnail,
          duration: info.duration,
          uploader: info.uploader,
          formats: buildFormatList(info.formats || []),
          raw_id: info.id,
        });
      } catch (e) {
        reject(new Error('Impossible de parser la réponse yt-dlp'));
      }
    });
  });
}

/**
 * Construit une liste propre de formats disponibles pour l'UI
 */
function buildFormatList(formats) {
  const videoWithAudio = formats
    .filter((f) => f.vcodec !== 'none' && f.acodec !== 'none' && f.height)
    .map((f) => ({
      format_id: f.format_id,
      quality: `${f.height}p`,
      height: f.height,
      ext: f.ext,
      filesize: f.filesize || f.filesize_approx,
      type: 'video-progressive',
    }));

  const videoOnly = formats
    .filter((f) => f.vcodec !== 'none' && f.acodec === 'none' && f.height)
    .map((f) => ({
      format_id: f.format_id,
      quality: `${f.height}p`,
      height: f.height,
      ext: f.ext,
      filesize: f.filesize || f.filesize_approx,
      type: 'video-only',
    }));

  // Qualités clés disponibles (progressive + merge)
  const allHeights = new Set([...videoWithAudio, ...videoOnly].map((f) => f.height));
  const qualityOptions = [1080, 720, 480, 360]
    .filter((h) => Array.from(allHeights).some((ah) => ah >= h))
    .map((h) => ({ quality: `${h}p`, height: h }));

  return {
    qualities: qualityOptions,
    audio_available: true, // yt-dlp extraira toujours l'audio
    progressive: videoWithAudio,
    video_only: videoOnly,
  };
}

/**
 * Stream un téléchargement au client (MP4 avec audio, ou MP3)
 * Utilise le format selector "bv*[height<=H]+ba/b[height<=H]" qui GARANTIT
 * la présence de l'audio (video + best audio, merge via ffmpeg)
 */
function streamDownload({ url, format, quality, res, onEnd }) {
  const isAudio = format === 'mp3';
  let args;

  if (isAudio) {
    args = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', quality === '128' ? '5' : '0', // 0 = best (~192-320k)
      '-o', '-',
      url,
    ];
  } else {
    const heightCap = parseInt((quality || '720').replace('p', ''), 10) || 720;
    // bv* = best video, ba = best audio, merge en mp4 ; fallback b = best progressif
    const selector = `bv*[height<=${heightCap}]+ba/b[height<=${heightCap}]/bv*+ba/b`;
    args = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '-f', selector,
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', config.ffmpegBin,
      '-o', '-',
      url,
    ];
  }

  logger.info('yt-dlp', args.join(' '));
  const proc = spawn(config.ytdlpBin, args, { timeout: config.downloadTimeoutMs });

  let errBuf = '';
  proc.stderr.on('data', (d) => {
    errBuf += d.toString();
    // Log en debug seulement (yt-dlp est verbeux)
  });

  proc.stdout.pipe(res);

  proc.on('error', (e) => {
    logger.error('spawn error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur lors du téléchargement.' });
    if (onEnd) onEnd({ ok: false, error: e.message });
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      logger.warn(`yt-dlp exit ${code}:`, errBuf.slice(0, 500));
      if (!res.headersSent) {
        res.status(500).json({ error: 'Téléchargement échoué. Vérifiez le lien.' });
      } else {
        res.end();
      }
      if (onEnd) onEnd({ ok: false, error: `exit ${code}` });
    } else {
      res.end();
      if (onEnd) onEnd({ ok: true });
    }
  });

  // Si le client annule
  res.on('close', () => {
    if (!proc.killed) proc.kill('SIGKILL');
  });
}

module.exports = { isFacebookUrl, getVideoInfo, streamDownload };
