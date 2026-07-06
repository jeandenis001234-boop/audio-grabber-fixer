# FBDown Pro

> **Téléchargeur de vidéos Facebook** — API Node.js + site web moderne + panel administrateur, prêt à déployer sur un VPS en une seule commande.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![Express](https://img.shields.io/badge/express-4.x-blue) ![License](https://img.shields.io/badge/license-MIT-purple)

---

## ✨ Fonctionnalités

### 🎯 API
- `GET /api/info?url=...` — métadonnées de la vidéo (titre, miniature, formats)
- `GET /api/download?url=...&format=mp4&quality=720p` — téléchargement direct **avec audio**
- `GET /api/download?url=...&format=mp3&quality=320` — extraction MP3
- Rate limiting configurable · Blacklist IP · Logs SQLite

### 🌐 Site public
- Design **dark premium** (glassmorphism, orbes floues, dégradés animés)
- Responsive mobile/tablette/desktop
- SEO-ready : meta OG, Twitter cards, JSON-LD, sitemap.xml, robots.txt
- Pages légales complètes : CGU, confidentialité, cookies, DMCA, contact, à propos
- Bannière cookies RGPD
- Slots prêts pour **Google AdSense** et **Google Analytics**
- Formats disponibles : MP4 1080p/720p/480p/360p + MP3 128/320 kbps

### 🛡️ Panel administrateur (`/admin`)
- Login sécurisé (JWT cookie httpOnly, bcrypt 12 rounds, rate limit)
- **Dashboard** : total téléchargements, réussis/échoués, courbe 7 jours, top IPs, répartition formats
- **Historique** paginé avec filtres
- **Blacklist IP** (ajout/suppression avec raison)
- **Gestion multi-admins** (rôles admin / superadmin)
- **Paramètres runtime** : AdSense, GA, nom du site, description SEO
- **Changement de mot de passe**

### 🚀 Installateur automatique
- Détection OS + IP publique
- Menu interactif (activer/désactiver chaque composant)
- Installation Node 20 + yt-dlp + ffmpeg + nginx + certbot
- **Vérification DNS** du domaine (attend que ça pointe sur le VPS)
- **SSL Let's Encrypt** automatique
- Service `systemd` avec redémarrage auto
- Firewall UFW configuré
- Sortie terminal stylisée (couleurs, spinners, banners ASCII)

---

## 🚀 Installation rapide (VPS Ubuntu/Debian)

```bash
git clone https://github.com/jeandenis001234-boop/fbdown-pro.git
cd fbdown-pro
sudo bash install.sh
```

L'installateur vous demande :
1. Dossier d'installation, port
2. Composants à activer (site public, admin, nginx, SSL)
3. Nom de domaine (avec vérification DNS auto)
4. Email admin + mot de passe

Puis tout est déployé automatiquement.

---

## 🛠️ Développement local

```bash
git clone https://github.com/VOTRE-USER/fbdown-pro.git
cd fbdown-pro
npm install
cp .env.example .env
# Éditez .env — au minimum ADMIN_PASSWORD_HASH :
node -e "console.log(require('bcryptjs').hashSync('votremotdepasse', 12))"
npm start
```

Prérequis locaux : Node ≥18, `yt-dlp` et `ffmpeg` dans le PATH.

---

## 📁 Arborescence

```
fbdown-pro/
├── server.js               # Point d'entrée Express
├── install.sh              # Installateur VPS interactif
├── package.json
├── .env.example
├── src/
│   ├── config.js
│   ├── db.js               # SQLite (better-sqlite3)
│   ├── middleware/auth.js
│   ├── routes/
│   │   ├── api.js          # /api/info, /api/download
│   │   ├── auth.js         # login admin
│   │   └── admin.js        # panel admin API
│   └── utils/
│       ├── ytdlp.js        # spawn yt-dlp + ffmpeg merge
│       └── logger.js
├── public/                 # Site public statique
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── legal/              # CGU, privacy, cookies, DMCA...
│   ├── robots.txt
│   └── sitemap.xml
├── admin/                  # SPA panel admin
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
└── data/                   # SQLite DB (créé au 1er run)
```

---

## 🔑 Correction du problème "vidéo sans son"

L'ancien script filtrait `f.vcodec === 'none'` puis prenait le premier format vidéo, qui sur Facebook DASH est **video-only** (sans audio).

Le nouveau `src/utils/ytdlp.js` utilise le sélecteur yt-dlp :

```
-f "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b" --merge-output-format mp4
```

→ Prend la meilleure vidéo + meilleur audio, les fusionne via ffmpeg. **Toujours** avec son.

Pour le MP3 :
```
-f bestaudio/best -x --audio-format mp3 --audio-quality 0
```

---

## 💰 Monétisation

1. **AdSense** : renseignez `ADSENSE_CLIENT` dans `.env` ou via le panel admin, puis ajoutez vos `<ins class="adsbygoogle">` dans `public/index.html` (slots préparés : `#ad-top`).
2. **Google Analytics** : renseignez `GA_MEASUREMENT_ID`.
3. **Indexation Google** : soumettez `https://votre-domaine.com/sitemap.xml` dans Google Search Console. Le site est déjà SEO-optimisé (meta OG, JSON-LD, H1 unique, mobile-first).

---

## 🔒 Sécurité

- Helmet (CSP configurée pour AdSense/GA)
- CORS activé
- Rate limiting global + par endpoint sensible
- bcrypt (12 rounds) pour les mots de passe
- JWT en cookie httpOnly + secure en prod
- Prepared statements SQLite
- Validation stricte des URLs (regex Facebook)

---

## 📄 Licence

MIT — utilisation libre pour projets personnels et commerciaux.

⚠️ **Avertissement** : ce projet est un outil technique. L'utilisateur final est responsable du respect des CGU de Facebook / Meta et du droit d'auteur des contenus téléchargés.

---

## 🆘 Support

- Logs service : `journalctl -u fbdown -f`
- Logs installation : `/tmp/fbdown-install.log`
- Redémarrer : `systemctl restart fbdown`
- Éditer config : `nano /opt/fbdown-pro/.env` puis `systemctl restart fbdown`
