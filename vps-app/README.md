# Audio Grabber Fixer

> **Téléchargeur de vidéos Facebook** — API Node.js/Express + site web moderne + panel administrateur, prêt à déployer sur un VPS depuis le repo `audio-grabber-fixer`.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![Express](https://img.shields.io/badge/express-4.x-blue) ![License](https://img.shields.io/badge/license-MIT-purple)

---

## ✨ Fonctionnalités

### 🎯 API

- `GET /api/info?url=...` — métadonnées de la vidéo : titre, miniature, formats.
- `GET /api/download?url=...&format=mp4&quality=720p` — téléchargement MP4 direct **avec audio**.
- `GET /api/download?url=...&format=mp3&quality=320` — extraction MP3.
- `GET /api/health` — diagnostic rapide du serveur et des assets CSS/JS.
- Rate limiting configurable · Blacklist IP · Historique SQLite.

### 🌐 Site public

- Interface responsive avec animations, glassmorphism, effets lumineux et cartes dynamiques.
- SEO-ready : meta tags, JSON-LD, sitemap dynamique, robots dynamique.
- Pages légales : conditions d'utilisation, confidentialité, cookies, DMCA, contact, à propos.
- Bannière cookies RGPD.
- Emplacements prêts pour Google AdSense et Google Analytics.
- Formats : MP4 1080p/720p/480p/360p selon disponibilité + MP3 128/320 kbps.

### 🛡️ Panel administrateur (`/admin`)

- Login sécurisé : JWT en cookie httpOnly, bcrypt 12 rounds, rate limit.
- Dashboard : total téléchargements, réussis/échoués, activité 7 jours, top IPs, formats.
- Historique paginé avec suppression.
- Blacklist IP.
- Gestion multi-admins.
- Paramètres publicité/SEO.
- Import multi-format des cookies Facebook : Netscape, JSON, header string, cURL, fichier.
- Changement de mot de passe.

### 🚀 Installateur automatique

- Détection OS + IP publique.
- Installation Node.js 20, `yt-dlp`, `ffmpeg`, Nginx et Certbot.
- Dossier par défaut corrigé : `/opt/audio-grabber-fixer`.
- Service systemd : `audio-grabber-fixer`.
- Vérification automatique que le site, `/css/style.css` et `/js/app.js` répondent bien.
- Configuration Nginx reverse proxy.
- SSL Let's Encrypt si un domaine pointe déjà vers le VPS.
- Firewall UFW configuré.
- Logs propres pour diagnostiquer rapidement.

---

## 🚀 Installation rapide sur VPS Ubuntu/Debian

```bash
git clone https://github.com/jeandenis001234-boop/audio-grabber-fixer.git
cd audio-grabber-fixer/vps-app
chmod +x install.sh
sudo ./install.sh
```

L'installateur demande :

1. Dossier d'installation — défaut : `/opt/audio-grabber-fixer`
2. Port interne — défaut : `3000`
3. Site public, panel admin, Nginx et SSL
4. Nom de domaine si Nginx est activé
5. Identifiants du compte administrateur
6. Import optionnel des cookies Facebook

> **Important SSL :** Let's Encrypt ne peut pas créer un certificat pour une simple IP. Pour avoir le cadenas HTTPS, il faut un domaine ou sous-domaine dont l'enregistrement A pointe vers l'IP publique du VPS avant de lancer l'installation.

---

## ✅ Vérifier après installation

```bash
curl http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:3000/css/style.css
curl -I http://127.0.0.1:3000/js/app.js
sudo systemctl status audio-grabber-fixer
sudo journalctl -u audio-grabber-fixer -f
```

Si `style.css` ou `app.js` ne répond pas `200 OK`, le site affichera seulement du HTML sans effets. L'installateur contrôle maintenant ces fichiers automatiquement.

Si vous utilisez Nginx :

```bash
sudo nginx -t
sudo systemctl status nginx
```

---

## 🛠️ Développement local

```bash
git clone https://github.com/jeandenis001234-boop/audio-grabber-fixer.git
cd audio-grabber-fixer/vps-app
npm install
cp .env.example .env
node -e "console.log(require('bcryptjs').hashSync('votremotdepasse', 12))"
# Copiez le hash dans ADMIN_PASSWORD_HASH puis :
npm start
```

Prérequis locaux : Node ≥18, `yt-dlp` et `ffmpeg` disponibles dans le PATH.

---

## 📁 Arborescence

```text
audio-grabber-fixer/
└── vps-app/
    ├── server.js               # Point d'entrée Express
    ├── install.sh              # Installateur VPS interactif
    ├── package.json
    ├── .env.example
    ├── src/
    │   ├── config.js
    │   ├── db.js               # SQLite
    │   ├── middleware/auth.js
    │   ├── routes/
    │   │   ├── api.js          # /api/info, /api/download, /api/health
    │   │   ├── auth.js         # login admin
    │   │   └── admin.js        # API panel admin
    │   └── utils/
    │       ├── cookies.js      # import cookies multi-format
    │       ├── ytdlp.js        # yt-dlp + ffmpeg merge audio/vidéo
    │       └── logger.js
    ├── public/                 # Site public
    │   ├── index.html
    │   ├── css/style.css
    │   ├── js/app.js
    │   └── legal/
    ├── admin/                  # Panel admin
    │   ├── index.html
    │   ├── css/admin.css
    │   └── js/admin.js
    └── data/                   # DB SQLite + cookies, créé au runtime
```

---

## 🔑 Correction du problème “vidéo sans son”

Les formats Facebook DASH peuvent fournir une vidéo seule, sans piste audio. Le script utilise maintenant un sélecteur qui force la fusion vidéo + audio via `ffmpeg` :

```bash
-f "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b" --merge-output-format mp4
```

Pour le MP3 :

```bash
-f bestaudio/best -x --audio-format mp3 --audio-quality 0
```

---

## 🍪 Cookies Facebook

Par défaut, seules les vidéos publiques fonctionnent. Pour les vidéos réservées aux comptes connectés, groupes ou contenus 18+, l'admin peut fournir des cookies Facebook.

Formats supportés automatiquement :

| Format | Source | Exemple |
|---|---|---|
| Netscape `cookies.txt` | Extension “Get cookies.txt LOCALLY” | `# Netscape HTTP Cookie File` |
| JSON | EditThisCookie, Cookie-Editor | `[{"domain":".facebook.com","name":"c_user"}]` |
| Header string | DevTools → Network → Cookie | `c_user=123; xs=abc; datr=xyz` |
| cURL | “Copy as cURL” | `-H "Cookie: c_user=..."` |

Import possible :

- pendant l'installation ;
- après installation dans `/admin` → **Cookies Facebook**.

Le fichier final est stocké en `chmod 600` dans `data/fb-cookies.txt` et transmis à `yt-dlp` via `--cookies`.

> Utilisez un compte Facebook dédié. Des cookies de session donnent accès au compte correspondant.

---

## 💰 Monétisation et indexation

- AdSense : renseigner `ADSENSE_CLIENT` dans `.env` ou via le panel admin.
- Google Analytics : renseigner `GA_MEASUREMENT_ID`.
- Sitemap : `https://votre-domaine.com/sitemap.xml` est généré avec `PUBLIC_URL`.
- Robots : `https://votre-domaine.com/robots.txt` est généré avec `PUBLIC_URL`.

---

## 🔒 Sécurité

- Helmet avec CSP compatible AdSense/GA.
- Cookies admin httpOnly.
- bcrypt 12 rounds.
- Prepared statements SQLite.
- Rate limiting.
- Validation stricte des URLs Facebook.
- Cookies Facebook filtrés pour ne conserver que les domaines Facebook.

---

## 🆘 Commandes utiles

```bash
sudo systemctl status audio-grabber-fixer
sudo journalctl -u audio-grabber-fixer -f
sudo systemctl restart audio-grabber-fixer
sudo nano /opt/audio-grabber-fixer/.env
curl http://127.0.0.1:3000/api/health
```

Logs d'installation :

```bash
cat /tmp/audio-grabber-fixer-install.log
```

---

## 📄 Licence

MIT — utilisation libre pour projets personnels et commerciaux.

⚠️ Ce projet est un outil technique. L'utilisateur final est responsable du respect des conditions d'utilisation des plateformes et du droit d'auteur.
