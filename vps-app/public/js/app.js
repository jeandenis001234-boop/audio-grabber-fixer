// === FBDown Pro — Frontend ===
(function () {
  const $ = (s) => document.querySelector(s);
  const urlInput = $('#urlInput');
  const fetchBtn = $('#fetchBtn');
  const pasteBtn = $('#pasteBtn');
  const resultSection = $('#resultSection');
  const resultCard = $('#resultCard');
  const btnText = fetchBtn.querySelector('.btn-text');
  const menuToggle = $('#menuToggle');
  const navLinks = document.querySelector('.nav-links');
  const cookieBanner = $('#cookieBanner');

  $('#year').textContent = new Date().getFullYear();

  menuToggle?.addEventListener('click', () => navLinks.classList.toggle('open'));

  // Cookie banner
  if (!localStorage.getItem('cookieChoice')) {
    setTimeout(() => (cookieBanner.hidden = false), 1500);
  }
  $('#cookieAccept')?.addEventListener('click', () => {
    localStorage.setItem('cookieChoice', 'accepted');
    cookieBanner.hidden = true;
  });
  $('#cookieRefuse')?.addEventListener('click', () => {
    localStorage.setItem('cookieChoice', 'refused');
    cookieBanner.hidden = true;
  });

  // Paste from clipboard
  pasteBtn?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text.trim();
      urlInput.focus();
    } catch {
      toast('Impossible d\'accéder au presse-papier.', 'error');
    }
  });

  // Toast helper
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // Validate FB URL
  const FB_REGEX = /^https?:\/\/(www\.|web\.|m\.|mbasic\.|business\.)?(facebook|fb)\.(com|watch)\/[^\s]+$/i;

  function setLoading(loading) {
    fetchBtn.disabled = loading;
    if (loading) {
      btnText.innerHTML = '<span class="spinner"></span>';
    } else {
      btnText.textContent = 'Télécharger';
    }
  }

  async function fetchInfo() {
    const url = urlInput.value.trim();
    if (!url) return toast('Veuillez coller un lien Facebook.', 'error');
    if (!FB_REGEX.test(url)) return toast('Ce lien ne semble pas être une URL Facebook valide.', 'error');

    setLoading(true);
    resultSection.hidden = true;

    try {
      const r = await fetch('/api/info?url=' + encodeURIComponent(url));
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Erreur inconnue');
      renderResult(url, data);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / 1024 / 1024;
    return mb > 1000 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(1) + ' MB';
  }

  function fmtDuration(s) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    return `${m}:${sec}`;
  }

  function renderResult(url, data) {
    const q = data.formats.qualities;
    const encodedUrl = encodeURIComponent(url);

    const videoBtns = q.map(({ quality, height }) => {
      const label = height >= 1080 ? 'Full HD' : height >= 720 ? 'HD' : 'Standard';
      return `
        <a class="format-btn" href="/api/download?url=${encodedUrl}&format=mp4&quality=${quality}" download>
          <div class="format-label"><strong>MP4 · ${quality}</strong><span>${label}</span></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </a>`;
    }).join('');

    const audioBtns = `
      <a class="format-btn" href="/api/download?url=${encodedUrl}&format=mp3&quality=320" download>
        <div class="format-label"><strong>MP3 · 320 kbps</strong><span>Qualité maximale</span></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </a>
      <a class="format-btn" href="/api/download?url=${encodedUrl}&format=mp3&quality=128" download>
        <div class="format-label"><strong>MP3 · 128 kbps</strong><span>Fichier plus léger</span></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </a>`;

    resultCard.innerHTML = `
      <div class="video-preview">
        ${data.thumbnail ? `<img class="video-thumb" src="${data.thumbnail}" alt="Miniature" referrerpolicy="no-referrer" />` : ''}
        <div class="video-info">
          <h3 class="video-title">${escapeHtml(data.title || 'Vidéo Facebook')}</h3>
          <p class="video-meta">
            ${data.uploader ? '👤 ' + escapeHtml(data.uploader) + ' · ' : ''}
            ${data.duration ? '⏱ ' + fmtDuration(data.duration) : ''}
          </p>
        </div>
      </div>
      <h4 style="margin: 24px 0 12px; font-size: 15px; color: var(--text-dim);">📹 Vidéo (avec son)</h4>
      <div class="formats-grid">${videoBtns || '<p style="color:var(--text-mute)">Aucun format vidéo disponible.</p>'}</div>
      <h4 style="margin: 24px 0 12px; font-size: 15px; color: var(--text-dim);">🎵 Audio uniquement</h4>
      <div class="formats-grid">${audioBtns}</div>
    `;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  fetchBtn.addEventListener('click', fetchInfo);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchInfo(); });
})();
