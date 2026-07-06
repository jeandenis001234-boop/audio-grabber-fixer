// === FBDown Pro — Admin Panel ===
(function () {
  const $ = (s) => document.querySelector(s);
  const loginScreen = $('#login-screen');
  const dashboard = $('#dashboard');
  const viewContainer = $('#viewContainer');
  const viewTitle = $('#viewTitle');
  let currentUser = null;

  const api = async (path, opts = {}) => {
    const r = await fetch('/api' + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401) { showLogin(); throw new Error('Non authentifié'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  };

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function showLogin() {
    loginScreen.hidden = false;
    dashboard.hidden = true;
  }
  function showDashboard() {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    $('#userName').textContent = currentUser.username;
    $('#userAvatar').textContent = currentUser.username[0].toUpperCase();
    switchView('stats');
  }

  // --- Login ---
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const err = $('#loginError');
    err.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span>Connexion...</span>';
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { username: $('#loginUser').value, password: $('#loginPass').value },
      });
      currentUser = data.user;
      showDashboard();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Se connecter</span>';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    currentUser = null;
    showLogin();
  });

  // --- Check session on load ---
  (async () => {
    try {
      const data = await api('/auth/me');
      currentUser = data.user;
      showDashboard();
    } catch { showLogin(); }
  })();

  // --- Nav ---
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  const titles = {
    stats: 'Statistiques',
    downloads: 'Téléchargements',
    blacklist: 'Blacklist IP',
    admins: 'Administrateurs',
    cookies: 'Cookies Facebook',
    settings: 'Paramètres',
    password: 'Changer le mot de passe',
  };

  function switchView(view) {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    viewTitle.textContent = titles[view];
    views[view]();
  }

  const views = {
    async stats() {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const s = await api('/admin/stats');
      const maxBar = Math.max(...s.last7days.map((d) => d.count), 1);
      const bars = s.last7days.map((d) => `
        <div class="bar-col">
          <div class="bar" style="height:${(d.count / maxBar) * 100}%">
            <span class="bar-value">${d.count}</span>
          </div>
          <div class="bar-label">${d.day.slice(5)}</div>
        </div>`).join('') || '<p class="empty">Pas encore de données.</p>';
      const formatRows = s.byFormat.map((f) => `<tr><td><span class="badge badge-format">${f.format.toUpperCase()}</span></td><td>${f.count}</td></tr>`).join('');
      const ipRows = s.topIps.map((r) => `<tr><td>${r.ip}</td><td>${r.count}</td></tr>`).join('');

      viewContainer.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card primary"><div class="label">Total téléchargements</div><div class="value">${s.total}</div></div>
          <div class="stat-card success"><div class="label">Réussis</div><div class="value">${s.success}</div></div>
          <div class="stat-card danger"><div class="label">Échoués</div><div class="value">${s.failed}</div></div>
          <div class="stat-card"><div class="label">Aujourd'hui</div><div class="value">${s.today}</div></div>
        </div>
        <div class="panel">
          <div class="panel-header"><span class="panel-title">📈 Activité 7 derniers jours</span></div>
          <div class="chart-bars">${bars}</div>
        </div>
        <div class="stats-grid">
          <div class="panel">
            <div class="panel-header"><span class="panel-title">📊 Par format</span></div>
            <table><tbody>${formatRows || '<tr><td colspan="2" class="empty">Aucune donnée</td></tr>'}</tbody></table>
          </div>
          <div class="panel">
            <div class="panel-header"><span class="panel-title">🌐 Top IPs</span></div>
            <table><tbody>${ipRows || '<tr><td colspan="2" class="empty">Aucune donnée</td></tr>'}</tbody></table>
          </div>
        </div>
      `;
    },

    async downloads(page = 1) {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const { rows, total, limit } = await api(`/admin/downloads?page=${page}&limit=50`);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const trs = rows.map((r) => `
        <tr>
          <td>${r.id}</td>
          <td class="url-cell" title="${escapeAttr(r.url)}">${escapeHtml(r.url)}</td>
          <td><span class="badge badge-format">${r.format.toUpperCase()}</span></td>
          <td>${r.quality || '-'}</td>
          <td>${r.ip}</td>
          <td><span class="badge badge-${r.status}">${r.status}</span></td>
          <td>${new Date(r.created_at).toLocaleString('fr')}</td>
          <td><button class="btn-sm btn-danger" onclick="window.__deleteDl(${r.id})">Supprimer</button></td>
        </tr>`).join('');
      viewContainer.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">${total} téléchargements</span>
            <button class="btn-sm btn-danger" id="clearAll">Tout effacer</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>URL</th><th>Format</th><th>Qualité</th><th>IP</th><th>Statut</th><th>Date</th><th></th></tr></thead>
              <tbody>${trs || '<tr><td colspan="8" class="empty">Aucun téléchargement</td></tr>'}</tbody>
            </table>
          </div>
          <div class="pagination">
            <button ${page <= 1 ? 'disabled' : ''} onclick="window.__page(${page - 1})">← Préc</button>
            <span class="current btn-sm">${page} / ${totalPages}</span>
            <button ${page >= totalPages ? 'disabled' : ''} onclick="window.__page(${page + 1})">Suiv →</button>
          </div>
        </div>`;
      window.__page = (p) => views.downloads(p);
      window.__deleteDl = async (id) => {
        if (!confirm('Supprimer cette entrée ?')) return;
        await api('/admin/downloads/' + id, { method: 'DELETE' });
        views.downloads(page);
      };
      $('#clearAll').onclick = async () => {
        if (!confirm('Effacer TOUS les téléchargements ?')) return;
        await api('/admin/downloads/clear', { method: 'POST' });
        toast('Historique effacé', 'success');
        views.downloads(1);
      };
    },

    async blacklist() {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const { rows } = await api('/admin/blacklist');
      const trs = rows.map((r) => `
        <tr>
          <td><code>${r.ip}</code></td>
          <td>${escapeHtml(r.reason || '-')}</td>
          <td>${new Date(r.created_at).toLocaleString('fr')}</td>
          <td><button class="btn-sm btn-danger" onclick="window.__unban('${r.ip}')">Débannir</button></td>
        </tr>`).join('');
      viewContainer.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Ajouter une IP</span></div>
          <div class="form-grid">
            <div class="form-group"><label>Adresse IP</label><input id="banIp" placeholder="1.2.3.4"></div>
            <div class="form-group"><label>Raison</label><input id="banReason" placeholder="Abus"></div>
          </div>
          <div class="form-actions"><button class="btn-primary" style="width:auto;margin:0;padding:10px 20px;height:auto" id="banBtn">Bannir</button></div>
        </div>
        <div class="panel">
          <div class="panel-header"><span class="panel-title">${rows.length} IP bannies</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>IP</th><th>Raison</th><th>Date</th><th></th></tr></thead>
              <tbody>${trs || '<tr><td colspan="4" class="empty">Aucune IP bannie</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
      $('#banBtn').onclick = async () => {
        const ip = $('#banIp').value.trim();
        if (!ip) return toast('IP requise', 'error');
        await api('/admin/blacklist', { method: 'POST', body: { ip, reason: $('#banReason').value } });
        toast('IP bannie', 'success');
        views.blacklist();
      };
      window.__unban = async (ip) => {
        await api('/admin/blacklist/' + encodeURIComponent(ip), { method: 'DELETE' });
        views.blacklist();
      };
    },

    async admins() {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const { rows } = await api('/admin/admins');
      const trs = rows.map((r) => `
        <tr>
          <td>${r.username}</td>
          <td>${escapeHtml(r.email || '-')}</td>
          <td><span class="badge badge-format">${r.role}</span></td>
          <td>${r.last_login ? new Date(r.last_login).toLocaleString('fr') : 'Jamais'}</td>
          <td>${r.id === currentUser.id ? '<span style="color:var(--text-mute);font-size:12px">(vous)</span>' : `<button class="btn-sm btn-danger" onclick="window.__delAdmin(${r.id})">Supprimer</button>`}</td>
        </tr>`).join('');
      viewContainer.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Créer un administrateur</span></div>
          <div class="form-grid">
            <div class="form-group"><label>Nom d'utilisateur</label><input id="newUser"></div>
            <div class="form-group"><label>Email</label><input id="newEmail" type="email"></div>
            <div class="form-group"><label>Mot de passe (min 8)</label><input id="newPass" type="password"></div>
            <div class="form-group"><label>Rôle</label><select id="newRole"><option value="admin">Admin</option><option value="superadmin">Super admin</option></select></div>
          </div>
          <div class="form-actions"><button class="btn-primary" style="width:auto;margin:0;padding:10px 20px;height:auto" id="addAdmin">Créer</button></div>
        </div>
        <div class="panel">
          <div class="panel-header"><span class="panel-title">${rows.length} administrateurs</span></div>
          <div class="table-wrap">
            <table><thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Dernière connexion</th><th></th></tr></thead><tbody>${trs}</tbody></table>
          </div>
        </div>`;
      $('#addAdmin').onclick = async () => {
        try {
          await api('/admin/admins', {
            method: 'POST',
            body: { username: $('#newUser').value, email: $('#newEmail').value, password: $('#newPass').value, role: $('#newRole').value },
          });
          toast('Administrateur créé', 'success');
          views.admins();
        } catch (e) { toast(e.message, 'error'); }
      };
      window.__delAdmin = async (id) => {
        if (!confirm('Supprimer cet administrateur ?')) return;
        await api('/admin/admins/' + id, { method: 'DELETE' });
        views.admins();
      };
    },

    async cookies() {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const info = await api('/admin/cookies');
      const status = info.exists
        ? (info.hasSessionCookies
            ? `<span class="badge badge-success">✓ Session valide</span>`
            : `<span class="badge badge-failed">⚠ Cookies incomplets (c_user/xs manquants)</span>`)
        : `<span class="badge badge-failed">✗ Aucun cookie configuré</span>`;
      const details = info.exists ? `
        <table style="width:100%;font-size:13px;margin-top:8px">
          <tr><td style="color:var(--text-mute);padding:4px 0">Fichier</td><td><code>${escapeHtml(info.path)}</code></td></tr>
          <tr><td style="color:var(--text-mute);padding:4px 0">Cookies</td><td>${info.cookieCount}</td></tr>
          <tr><td style="color:var(--text-mute);padding:4px 0">Expirés</td><td>${info.expired > 0 ? `<span style="color:var(--danger)">${info.expired}</span>` : '0'}</td></tr>
          <tr><td style="color:var(--text-mute);padding:4px 0">Modifié le</td><td>${new Date(info.modified).toLocaleString('fr')}</td></tr>
          <tr><td style="color:var(--text-mute);padding:4px 0">Taille</td><td>${info.size} octets</td></tr>
        </table>` : '';

      viewContainer.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">🍪 État actuel</span>
            ${status}
          </div>
          ${details}
          ${info.exists ? '<div class="form-actions" style="margin-top:16px"><button class="btn-sm btn-danger" id="delCookies">Supprimer les cookies</button> <button class="btn-sm" id="testCookies" style="background:var(--surface-2);color:var(--text)">Tester</button></div>' : ''}
          <div id="testResult" style="margin-top:12px"></div>
        </div>

        <div class="panel">
          <div class="panel-header"><span class="panel-title">📥 Importer des cookies</span></div>
          <p style="color:var(--text-dim);font-size:13px;margin:0 0 12px">
            Collez vos cookies Facebook dans <strong>n'importe lequel</strong> de ces formats — le format est détecté automatiquement :
          </p>

          <div class="tabs" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <button class="tab-btn active" data-tab="netscape">Netscape (.txt)</button>
            <button class="tab-btn" data-tab="json">JSON (extensions)</button>
            <button class="tab-btn" data-tab="header">Header string</button>
            <button class="tab-btn" data-tab="file">Fichier</button>
          </div>

          <div id="tab-help" style="background:var(--surface-2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-dim);margin-bottom:12px"></div>

          <div class="form-group">
            <label>Contenu des cookies</label>
            <textarea id="cookiesInput" rows="10" placeholder="Collez ici..." style="width:100%;font-family:monospace;font-size:12px;padding:10px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:8px;resize:vertical"></textarea>
          </div>
          <input type="file" id="cookiesFile" accept=".txt,.json" style="display:none">
          <div class="form-actions" style="display:flex;gap:8px;margin-top:12px">
            <button class="btn-primary" style="width:auto;margin:0;padding:10px 20px;height:auto" id="importCookies">Importer</button>
            <button class="btn-sm" id="pickFile" style="background:var(--surface-2);color:var(--text)">Choisir un fichier</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><span class="panel-title">❓ Comment obtenir vos cookies Facebook</span></div>
          <ol style="color:var(--text-dim);font-size:13px;line-height:1.8;padding-left:20px">
            <li>Installez l'extension <strong>"Get cookies.txt LOCALLY"</strong> (Chrome/Firefox — gratuite, open source).</li>
            <li>Connectez-vous à <a href="https://www.facebook.com" target="_blank" style="color:var(--primary)">facebook.com</a> avec un compte dédié (recommandé, pas votre compte principal).</li>
            <li>Cliquez sur l'icône de l'extension → <strong>Export</strong> (format Netscape ou JSON).</li>
            <li>Collez le contenu ci-dessus, ou uploadez le fichier téléchargé.</li>
          </ol>
          <p style="color:var(--warning);font-size:12px;margin-top:8px">
            ⚠️ Les cookies donnent accès à votre compte. Utilisez un compte Facebook dédié à cet usage. Le fichier est stocké en <code>chmod 600</code> sur le serveur.
          </p>
        </div>
      `;

      const helpTexts = {
        netscape: 'Fichier commençant par <code># Netscape HTTP Cookie File</code>. Généré par yt-dlp ou l\'extension "Get cookies.txt LOCALLY". Format tabulé : domain\\tflag\\tpath\\tsecure\\texpires\\tname\\tvalue',
        json: 'Tableau JSON exporté par <strong>EditThisCookie</strong>, <strong>Cookie-Editor</strong> ou "Get cookies.txt" (mode JSON). Ex: <code>[{"domain":".facebook.com","name":"c_user","value":"...","expirationDate":123}]</code>',
        header: 'Chaîne copiée depuis DevTools → Network → Headers → Cookie. Ex: <code>c_user=100012345; xs=xxx:yyy:zzz; datr=abc123; fr=xyz</code>. Fonctionne aussi avec "Copy as cURL".',
        file: 'Uploadez directement un fichier <code>cookies.txt</code> (Netscape) ou <code>.json</code> exporté depuis votre navigateur.',
      };
      const help = document.getElementById('tab-help');
      const setTab = (t) => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
        help.innerHTML = helpTexts[t];
      };
      setTab('netscape');
      document.querySelectorAll('.tab-btn').forEach((b) => b.onclick = () => setTab(b.dataset.tab));

      $('#pickFile').onclick = () => $('#cookiesFile').click();
      $('#cookiesFile').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        $('#cookiesInput').value = await f.text();
        toast('Fichier chargé — cliquez sur Importer', 'success');
      };

      $('#importCookies').onclick = async () => {
        const content = $('#cookiesInput').value.trim();
        if (!content) return toast('Contenu vide', 'error');
        try {
          const r = await api('/admin/cookies', { method: 'POST', body: { content } });
          toast(`${r.imported} cookies importés`, 'success');
          views.cookies();
        } catch (e) { toast(e.message, 'error'); }
      };

      if (info.exists) {
        $('#delCookies').onclick = async () => {
          if (!confirm('Supprimer les cookies Facebook ?')) return;
          await api('/admin/cookies', { method: 'DELETE' });
          toast('Cookies supprimés', 'success');
          views.cookies();
        };
        $('#testCookies').onclick = async () => {
          const box = $('#testResult');
          box.innerHTML = '<p class="empty">Test en cours...</p>';
          try {
            const r = await api('/admin/cookies/test', { method: 'POST', body: {} });
            if (r.ok) {
              box.innerHTML = `<div style="padding:12px;background:rgba(46,204,113,0.1);border:1px solid var(--success);border-radius:8px;font-size:13px">✓ Cookies fonctionnels — récupéré : <strong>${escapeHtml(r.title || '(sans titre)')}</strong></div>`;
            } else {
              box.innerHTML = `<div style="padding:12px;background:rgba(231,76,60,0.1);border:1px solid var(--danger);border-radius:8px;font-size:13px">✗ Échec : ${escapeHtml(r.error)}</div>`;
            }
          } catch (e) { box.innerHTML = `<div style="color:var(--danger);font-size:13px">${escapeHtml(e.message)}</div>`; }
        };
      }
    },

    async settings() {
      viewContainer.innerHTML = '<p class="empty">Chargement...</p>';
      const s = await api('/admin/settings');
      viewContainer.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Paramètres publicité & SEO</span></div>
          <div class="form-grid">
            <div class="form-group"><label>Code AdSense (ca-pub-...)</label><input id="s-adsense" value="${escapeAttr(s.adsense_client || '')}"></div>
            <div class="form-group"><label>Google Analytics ID (G-...)</label><input id="s-ga" value="${escapeAttr(s.ga_id || '')}"></div>
            <div class="form-group"><label>Nom du site</label><input id="s-name" value="${escapeAttr(s.site_name || '')}"></div>
            <div class="form-group"><label>Description (SEO)</label><input id="s-desc" value="${escapeAttr(s.site_description || '')}"></div>
          </div>
          <div class="form-actions"><button class="btn-primary" style="width:auto;margin:0;padding:10px 20px;height:auto" id="saveSettings">Enregistrer</button></div>
          <p style="color:var(--text-mute);font-size:12px;margin-top:12px">⚠️ Certains paramètres nécessitent un redémarrage du serveur pour prendre effet côté site public.</p>
        </div>`;
      $('#saveSettings').onclick = async () => {
        await api('/admin/settings', {
          method: 'POST',
          body: {
            adsense_client: $('#s-adsense').value,
            ga_id: $('#s-ga').value,
            site_name: $('#s-name').value,
            site_description: $('#s-desc').value,
          },
        });
        toast('Paramètres enregistrés', 'success');
      };
    },

    async password() {
      viewContainer.innerHTML = `
        <div class="panel" style="max-width:500px">
          <div class="panel-header"><span class="panel-title">Changer votre mot de passe</span></div>
          <div class="form-group"><label>Mot de passe actuel</label><input id="p-cur" type="password"></div>
          <div class="form-group"><label>Nouveau mot de passe (min 8)</label><input id="p-new" type="password"></div>
          <div class="form-group"><label>Confirmer</label><input id="p-conf" type="password"></div>
          <div class="form-actions"><button class="btn-primary" style="width:auto;margin:0;padding:10px 20px;height:auto" id="chPass">Modifier</button></div>
        </div>`;
      $('#chPass').onclick = async () => {
        const cur = $('#p-cur').value, np = $('#p-new').value, cf = $('#p-conf').value;
        if (np !== cf) return toast('Les mots de passe ne correspondent pas', 'error');
        if (np.length < 8) return toast('Minimum 8 caractères', 'error');
        try {
          await api('/admin/change-password', { method: 'POST', body: { current: cur, next: np } });
          toast('Mot de passe modifié', 'success');
          $('#p-cur').value = $('#p-new').value = $('#p-conf').value = '';
        } catch (e) { toast(e.message, 'error'); }
      };
    },
  };

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
})();
