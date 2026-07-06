#!/usr/bin/env bash
# ================================================================
#  Audio Grabber Fixer — Installateur automatique VPS
#  Ubuntu/Debian · Node.js + yt-dlp + ffmpeg + nginx + certbot
# ================================================================
set -e

# ---------- Couleurs & style ----------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[38;5;203m'; GREEN=$'\033[38;5;120m'; YELLOW=$'\033[38;5;222m'
  BLUE=$'\033[38;5;75m'; PURPLE=$'\033[38;5;171m'; CYAN=$'\033[38;5;87m'
  PINK=$'\033[38;5;213m'; GRAY=$'\033[38;5;244m'
else
  BOLD=""; DIM=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; PURPLE=""; CYAN=""; PINK=""; GRAY=""
fi

CHECK="${GREEN}✓${RESET}"
CROSS="${RED}✗${RESET}"
ARROW="${PURPLE}➜${RESET}"
DOT="${CYAN}•${RESET}"
APP_NAME="Audio Grabber Fixer"
SERVICE_NAME="audio-grabber-fixer"
INSTALL_LOG="/tmp/audio-grabber-fixer-install.log"

# ---------- Helpers ----------
banner() {
  clear
  cat <<EOF
${PURPLE}${BOLD}
    ███████╗██████╗ ██████╗  ██████╗ ██╗    ██╗███╗   ██╗    ██████╗ ██████╗  ██████╗
    ██╔════╝██╔══██╗██╔══██╗██╔═══██╗██║    ██║████╗  ██║    ██╔══██╗██╔══██╗██╔═══██╗
    █████╗  ██████╔╝██║  ██║██║   ██║██║ █╗ ██║██╔██╗ ██║    ██████╔╝██████╔╝██║   ██║
    ██╔══╝  ██╔══██╗██║  ██║██║   ██║██║███╗██║██║╚██╗██║    ██╔═══╝ ██╔══██╗██║   ██║
    ██║     ██████╔╝██████╔╝╚██████╔╝╚███╔███╔╝██║ ╚████║    ██║     ██║  ██║╚██████╔╝
    ╚═╝     ╚═════╝ ╚═════╝  ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═══╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝
${RESET}${GRAY}                    audio-grabber-fixer · API + Web Panel · v1.1${RESET}
${GRAY}       ────────────────────────────────────────────────────────────────${RESET}

EOF
}

section() { echo; echo "${BOLD}${BLUE}┌─ $1${RESET}"; }
step()    { echo "${BOLD}│${RESET} ${ARROW} $1"; }
ok()      { echo "${BOLD}│${RESET} ${CHECK} $1"; }
warn()    { echo "${BOLD}│${RESET} ${YELLOW}!${RESET} $1"; }
fail()    { echo "${BOLD}│${RESET} ${CROSS} ${RED}$1${RESET}"; exit 1; }
info()    { echo "${BOLD}│${RESET} ${DOT} ${DIM}$1${RESET}"; }
close()   { echo "${BOLD}└─${RESET}"; }

ask() {
  local prompt="$1" default="$2" answer
  if [[ -n "$default" ]]; then
    read -r -p "${BOLD}│${RESET} ${PINK}?${RESET} ${prompt} ${GRAY}[$default]${RESET}: " answer
    echo "${answer:-$default}"
  else
    read -r -p "${BOLD}│${RESET} ${PINK}?${RESET} ${prompt}: " answer
    echo "$answer"
  fi
}
ask_secret() {
  local prompt="$1" answer
  read -r -s -p "${BOLD}│${RESET} ${PINK}?${RESET} ${prompt}: " answer
  echo >&2
  echo "$answer"
}
ask_yn() {
  local prompt="$1" default="${2:-y}" answer
  local hint="[Y/n]"; [[ "$default" == "n" ]] && hint="[y/N]"
  read -r -p "${BOLD}│${RESET} ${PINK}?${RESET} ${prompt} ${GRAY}${hint}${RESET}: " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

spinner() {
  local pid=$1 msg=$2
  local chars="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r${BOLD}│${RESET} ${PURPLE}${chars:$((i%10)):1}${RESET} %s" "$msg"
    i=$((i+1))
    sleep 0.1
  done
  printf "\r${BOLD}│${RESET} ${CHECK} %s\n" "$msg"
}
run_spin() {
  local msg=$1; shift
  ("$@" >"$INSTALL_LOG" 2>&1) & spinner $! "$msg"
  wait $! || { cat "$INSTALL_LOG"; fail "Échec: $msg"; }
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "Cet installateur doit être exécuté en root. Utilisez: sudo bash install.sh"
  fi
}

get_public_ip() {
  curl -s -4 https://api.ipify.org || curl -s -4 https://ifconfig.me || echo ""
}

check_dns() {
  local domain=$1 expected_ip=$2
  local resolved
  resolved=$(resolve_domain "$domain")
  [[ "$resolved" == "$expected_ip" ]]
}

resolve_domain() {
  local domain=$1 resolved=""
  resolved=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1; exit}')
  if [[ -z "$resolved" ]] && command -v dig >/dev/null 2>&1; then
    resolved=$(dig +short A "$domain" @1.1.1.1 | tail -n1)
  fi
  echo "$resolved"
}

# ================================================================
#  MAIN
# ================================================================
banner
require_root

section "Détection de l'environnement"
step "Système d'exploitation"
. /etc/os-release
info "OS : $PRETTY_NAME"
if [[ ! "$ID" =~ ^(ubuntu|debian)$ ]]; then
  warn "Testé sur Ubuntu/Debian. Poursuite à vos risques."
fi

PUBLIC_IP=$(get_public_ip)
[[ -z "$PUBLIC_IP" ]] && fail "Impossible de détecter l'IP publique du VPS."
info "IP publique détectée : ${BOLD}$PUBLIC_IP${RESET}"
close

# --- Options d'installation ---
section "Configuration de l'installation"
INSTALL_DIR=$(ask "Dossier d'installation" "/opt/audio-grabber-fixer")
APP_PORT=$(ask "Port interne de l'application" "3000")

echo "${BOLD}│${RESET}"
echo "${BOLD}│${RESET}   ${BOLD}Composants à installer :${RESET}"
INSTALL_API=true
INSTALL_WEBPANEL=true
INSTALL_ADMIN=true
INSTALL_NGINX=true
INSTALL_SSL=true

ask_yn "Activer le site web public (interface utilisateur) ?" y && INSTALL_WEBPANEL=true || INSTALL_WEBPANEL=false
ask_yn "Activer le panel administrateur (/admin) ?" y && INSTALL_ADMIN=true || INSTALL_ADMIN=false
ask_yn "Configurer nginx en reverse proxy ?" y && INSTALL_NGINX=true || INSTALL_NGINX=false
[[ "$INSTALL_NGINX" != "true" ]] && INSTALL_SSL=false

DOMAIN=""
ADMIN_EMAIL_LE=""
if [[ "$INSTALL_NGINX" == "true" ]]; then
  echo "${BOLD}│${RESET}"
  ask_yn "Configurer HTTPS/SSL avec Let's Encrypt ?" y && INSTALL_SSL=true || INSTALL_SSL=false
  DOMAIN=$(ask "Nom de domaine (laisser vide pour utiliser seulement l'IP)" "")
  if [[ -z "$DOMAIN" ]]; then
    warn "Aucun domaine fourni : nginx servira le site sur http://$PUBLIC_IP et le SSL sera désactivé."
    INSTALL_SSL=false
  fi
  if [[ "$INSTALL_SSL" == "true" ]]; then
    ADMIN_EMAIL_LE=$(ask "Email pour Let's Encrypt (notifications)" "")
  fi
fi

echo "${BOLD}│${RESET}"
echo "${BOLD}│${RESET}   ${BOLD}Compte administrateur initial :${RESET}"
ADMIN_USER=$(ask "Nom d'utilisateur admin" "admin")
DEFAULT_ADMIN_EMAIL="admin@example.com"
[[ -n "$DOMAIN" ]] && DEFAULT_ADMIN_EMAIL="admin@$DOMAIN"
ADMIN_EMAIL=$(ask "Email admin" "$DEFAULT_ADMIN_EMAIL")

while true; do
  ADMIN_PASS=$(ask_secret "Mot de passe admin (min 8 caractères)")
  [[ ${#ADMIN_PASS} -lt 8 ]] && { warn "Trop court, réessayez."; continue; }
  ADMIN_PASS2=$(ask_secret "Confirmer le mot de passe")
  [[ "$ADMIN_PASS" == "$ADMIN_PASS2" ]] && break
  warn "Les mots de passe ne correspondent pas."
done
close

# --- Résumé ---
section "Récapitulatif"
echo "${BOLD}│${RESET}   Dossier          : ${CYAN}$INSTALL_DIR${RESET}"
echo "${BOLD}│${RESET}   Port interne     : ${CYAN}$APP_PORT${RESET}"
echo "${BOLD}│${RESET}   Site public      : $([ "$INSTALL_WEBPANEL" = true ] && echo "${GREEN}activé${RESET}" || echo "${GRAY}désactivé${RESET}")"
echo "${BOLD}│${RESET}   Panel admin      : $([ "$INSTALL_ADMIN" = true ] && echo "${GREEN}activé${RESET}" || echo "${GRAY}désactivé${RESET}")"
echo "${BOLD}│${RESET}   Nginx            : $([ "$INSTALL_NGINX" = true ] && echo "${GREEN}oui${RESET}" || echo "${GRAY}non${RESET}")"
echo "${BOLD}│${RESET}   SSL Let's Encrypt: $([ "$INSTALL_SSL" = true ] && echo "${GREEN}oui${RESET}" || echo "${GRAY}non${RESET}")"
[[ -n "$DOMAIN" ]] && echo "${BOLD}│${RESET}   Domaine          : ${CYAN}$DOMAIN${RESET}"
echo "${BOLD}│${RESET}   Admin            : ${CYAN}$ADMIN_USER${RESET}"
close

ask_yn "Continuer l'installation ?" y || { echo; echo "${YELLOW}Installation annulée.${RESET}"; exit 0; }

# --- Vérification DNS ---
if [[ -n "$DOMAIN" && "$INSTALL_SSL" == "true" ]]; then
  section "Vérification DNS"
  step "Résolution de $DOMAIN"
  if check_dns "$DOMAIN" "$PUBLIC_IP"; then
    ok "Le domaine pointe bien sur $PUBLIC_IP"
  else
    resolved=$(resolve_domain "$DOMAIN")
    warn "Le domaine ne pointe pas sur ce VPS."
    info "IP attendue : ${BOLD}$PUBLIC_IP${RESET}"
    info "IP résolue  : ${BOLD}${resolved:-aucune}${RESET}"
    echo "${BOLD}│${RESET}"
    echo "${BOLD}│${RESET}   ${YELLOW}Configurez un enregistrement A${RESET}:"
    echo "${BOLD}│${RESET}     ${CYAN}Type${RESET}: A"
    echo "${BOLD}│${RESET}     ${CYAN}Nom${RESET} : @ (ou $DOMAIN)"
    echo "${BOLD}│${RESET}     ${CYAN}Valeur${RESET}: $PUBLIC_IP"
    echo "${BOLD}│${RESET}     ${CYAN}TTL${RESET} : 300"
    echo "${BOLD}│${RESET}"
    if ask_yn "Réessayer après avoir configuré le DNS ?" y; then
      for i in {1..12}; do
        sleep 10
        step "Tentative $i/12..."
        if check_dns "$DOMAIN" "$PUBLIC_IP"; then
          ok "DNS OK !"
          break
        fi
      done
      check_dns "$DOMAIN" "$PUBLIC_IP" || {
        warn "DNS toujours incorrect."
        ask_yn "Continuer sans SSL ?" n && INSTALL_SSL=false || fail "Configurez le DNS puis relancez."
      }
    else
      INSTALL_SSL=false
      warn "SSL désactivé."
    fi
  fi
  close
fi

# --- Installation dépendances système ---
section "Installation des dépendances système"
step "Mise à jour APT"
run_spin "apt-get update" apt-get update -qq

PKGS="curl wget git rsync build-essential python3 python3-pip ffmpeg ca-certificates"
[[ "$INSTALL_NGINX" == "true" ]] && PKGS="$PKGS nginx"
[[ "$INSTALL_SSL" == "true" ]] && PKGS="$PKGS certbot python3-certbot-nginx"

run_spin "Installation de : ffmpeg, nginx, certbot..." apt-get install -y $PKGS

# Node.js 20 LTS
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
  step "Installation de Node.js 20 LTS"
  run_spin "Ajout du dépôt NodeSource" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  run_spin "Installation de Node.js" apt-get install -y nodejs
fi
ok "Node.js $(node -v)"

# yt-dlp (binaire officiel, plus à jour que le paquet apt)
step "Installation de yt-dlp (dernière version)"
run_spin "Téléchargement de yt-dlp" bash -c "curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp"
ok "yt-dlp $(/usr/local/bin/yt-dlp --version)"
close

# --- Copie des fichiers ---
section "Installation de $APP_NAME"
step "Création du dossier $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
step "Copie des fichiers"
cp -r "$SCRIPT_DIR"/{server.js,src,public,admin,package.json,.env.example} "$INSTALL_DIR/" 2>/dev/null || {
  # Fallback si lancé depuis le dossier lui-même
  rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' "$SCRIPT_DIR/" "$INSTALL_DIR/"
}

cd "$INSTALL_DIR"

step "Installation des dépendances npm"
run_spin "npm install (peut prendre 1-2 min)" npm install --production --no-audit --no-fund

# --- Génération des secrets ---
step "Génération des secrets"
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "$ADMIN_PASS")
ok "Secrets générés"

step "Écriture du fichier .env"
if [[ -n "$DOMAIN" ]]; then
  PUBLIC_URL="http://$DOMAIN"
  [[ "$INSTALL_SSL" == "true" ]] && PUBLIC_URL="https://$DOMAIN"
elif [[ "$INSTALL_NGINX" == "true" ]]; then
  PUBLIC_URL="http://$PUBLIC_IP"
else
  PUBLIC_URL="http://$PUBLIC_IP:$APP_PORT"
fi

cat > "$INSTALL_DIR/.env" <<ENV
PORT=$APP_PORT
NODE_ENV=production
PUBLIC_URL=$PUBLIC_URL

JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET

ADMIN_USERNAME=$ADMIN_USER
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD_HASH=$ADMIN_HASH

WEBPANEL_ENABLED=$INSTALL_WEBPANEL
ADMIN_PANEL_ENABLED=$INSTALL_ADMIN

SITE_NAME=Audio Grabber Fixer
SITE_DESCRIPTION=Télécharger les vidéos Facebook en MP4 HD et MP3 gratuitement

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=60
DOWNLOAD_RATE_LIMIT_MAX=20

YTDLP_BIN=/usr/local/bin/yt-dlp
FFMPEG_BIN=/usr/bin/ffmpeg
DOWNLOAD_TIMEOUT_MS=300000
DOWNLOAD_TMP_DIR=$INSTALL_DIR/data/tmp-downloads

FB_COOKIES_FILE=$INSTALL_DIR/data/fb-cookies.txt
ENV
chmod 600 "$INSTALL_DIR/.env"
ok "Configuration écrite"
close

# --- Cookies Facebook (optionnel) ---
section "Cookies Facebook (optionnel mais recommandé)"
echo "${BOLD}│${RESET}   ${DIM}Sans cookies, seules les vidéos 100% publiques fonctionnent.${RESET}"
echo "${BOLD}│${RESET}   ${DIM}Avec cookies : vidéos privées, groupes, réservées connectés, 18+.${RESET}"
echo "${BOLD}│${RESET}"
echo "${BOLD}│${RESET}   ${BOLD}Formats acceptés :${RESET}"
echo "${BOLD}│${RESET}     ${DOT} Netscape cookies.txt  ${DIM}(extension \"Get cookies.txt LOCALLY\")${RESET}"
echo "${BOLD}│${RESET}     ${DOT} JSON                  ${DIM}(EditThisCookie, Cookie-Editor)${RESET}"
echo "${BOLD}│${RESET}     ${DOT} Header string         ${DIM}(c_user=xxx; xs=yyy; datr=zzz)${RESET}"
echo "${BOLD}│${RESET}     ${DOT} Import via panel admin plus tard"
echo "${BOLD}│${RESET}"

mkdir -p "$INSTALL_DIR/data"

if ask_yn "Fournir un fichier cookies maintenant ?" n; then
  echo "${BOLD}│${RESET}"
  echo "${BOLD}│${RESET}   ${BOLD}Options :${RESET}"
  echo "${BOLD}│${RESET}     ${CYAN}1${RESET}) Chemin vers un fichier existant sur le VPS"
  echo "${BOLD}│${RESET}     ${CYAN}2${RESET}) Coller le contenu ici (Ctrl+D pour terminer)"
  echo "${BOLD}│${RESET}     ${CYAN}3${RESET}) Ignorer (configurer via panel plus tard)"
  COOKIE_OPT=$(ask "Choix" "3")
  COOKIE_TMP=$(mktemp)
  case "$COOKIE_OPT" in
    1)
      COOKIE_PATH=$(ask "Chemin du fichier" "")
      if [[ -f "$COOKIE_PATH" ]]; then
        cp "$COOKIE_PATH" "$COOKIE_TMP"
        ok "Fichier chargé"
      else
        warn "Fichier introuvable — ignoré."
        rm -f "$COOKIE_TMP"; COOKIE_TMP=""
      fi
      ;;
    2)
      echo "${BOLD}│${RESET}   ${DIM}Collez le contenu, puis Ctrl+D :${RESET}"
      cat > "$COOKIE_TMP"
      [[ -s "$COOKIE_TMP" ]] && ok "Contenu reçu" || { rm -f "$COOKIE_TMP"; COOKIE_TMP=""; warn "Vide — ignoré."; }
      ;;
    *)
      rm -f "$COOKIE_TMP"; COOKIE_TMP=""
      info "Ignoré — configurez via le panel admin."
      ;;
  esac

  if [[ -n "$COOKIE_TMP" && -s "$COOKIE_TMP" ]]; then
    step "Import et conversion multi-format"
    (cd "$INSTALL_DIR" && node -e "
      const c = require('./src/utils/cookies');
      const fs = require('fs');
      try {
        const info = c.saveCookies(fs.readFileSync('$COOKIE_TMP','utf8'));
        console.log('OK: ' + info.imported + ' cookies importés');
      } catch(e) { console.error('ERR: ' + e.message); process.exit(1); }
    ") && ok "Cookies installés" || warn "Import échoué — vous pourrez réessayer via le panel."
    rm -f "$COOKIE_TMP"
    chmod 600 "$INSTALL_DIR/data/fb-cookies.txt" 2>/dev/null || true
  fi
else
  info "Vous pourrez importer vos cookies via /admin → Cookies Facebook"
fi
close



# --- Service systemd ---
section "Configuration du service systemd"
if systemctl list-unit-files | grep -q '^fbdown.service'; then
  warn "Ancien service fbdown détecté : arrêt/désactivation pour éviter les conflits."
  systemctl stop fbdown.service >/dev/null 2>&1 || true
  systemctl disable fbdown.service >/dev/null 2>&1 || true
fi
step "Création de $SERVICE_NAME.service"
cat > /etc/systemd/system/$SERVICE_NAME.service <<UNIT
[Unit]
Description=Audio Grabber Fixer — Facebook Video Downloader
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/audio-grabber-fixer.log
StandardError=append:/var/log/audio-grabber-fixer.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

run_spin "Rechargement systemd" systemctl daemon-reload
run_spin "Activation du service" systemctl enable $SERVICE_NAME.service
run_spin "Démarrage du service" systemctl restart $SERVICE_NAME.service
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
  ok "Service démarré"
else
  fail "Le service n'a pas démarré. Logs: journalctl -u $SERVICE_NAME -n 50"
fi

step "Contrôle local du site et des assets"
if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/tmp/audio-grabber-fixer-health.json 2>/dev/null && \
   curl -fsS "http://127.0.0.1:$APP_PORT/css/style.css" >/dev/null 2>&1 && \
   curl -fsS "http://127.0.0.1:$APP_PORT/js/app.js" >/dev/null 2>&1; then
  ok "Site, CSS et JavaScript accessibles sur le port $APP_PORT"
else
  warn "Le serveur répond mal ou les assets CSS/JS sont introuvables. Vérifiez: journalctl -u $SERVICE_NAME -n 80"
fi
close

# --- Nginx ---
if [[ "$INSTALL_NGINX" == "true" ]]; then
  section "Configuration nginx"
  step "Création du vhost pour $DOMAIN"
  NGINX_SERVER_NAME="${DOMAIN:-_}"
  rm -f /etc/nginx/sites-enabled/fbdown /etc/nginx/sites-available/fbdown
  cat > /etc/nginx/sites-available/$SERVICE_NAME <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $NGINX_SERVER_NAME;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/$SERVICE_NAME
  rm -f /etc/nginx/sites-enabled/default

  run_spin "Test de la configuration nginx" nginx -t
  run_spin "Redémarrage nginx" systemctl restart nginx
  ok "nginx configuré"
  close

  if [[ "$INSTALL_SSL" == "true" ]]; then
    section "Certificat SSL Let's Encrypt"
    step "Obtention du certificat pour $DOMAIN"
    CERTBOT_EMAIL_ARG=""
    if [[ -n "$ADMIN_EMAIL_LE" ]]; then
      CERTBOT_EMAIL_ARG="--email $ADMIN_EMAIL_LE"
    else
      CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
    fi
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos $CERTBOT_EMAIL_ARG --redirect 2>&1 | tee /tmp/audio-grabber-fixer-certbot.log; then
      ok "SSL activé — https://$DOMAIN"
    else
      warn "Échec de certbot. Vérifiez /tmp/audio-grabber-fixer-certbot.log"
      warn "Le site reste accessible en HTTP."
    fi
    close
  fi
fi

# --- Firewall ---
if command -v ufw >/dev/null 2>&1; then
  section "Firewall (UFW)"
  step "Ouverture des ports"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  if [[ "$INSTALL_NGINX" == "true" ]]; then
    ufw allow 'Nginx Full' >/dev/null 2>&1 || true
    ok "Ports 22, 80, 443 ouverts"
  else
    ufw allow "$APP_PORT/tcp" >/dev/null 2>&1 || true
    ok "Ports 22 et $APP_PORT ouverts"
  fi
  close
fi

# ================================================================
#  Fin
# ================================================================
echo
echo "${GREEN}${BOLD}    ╔══════════════════════════════════════════════════════════╗${RESET}"
echo "${GREEN}${BOLD}    ║          🎉  INSTALLATION TERMINÉE AVEC SUCCÈS           ║${RESET}"
echo "${GREEN}${BOLD}    ╚══════════════════════════════════════════════════════════╝${RESET}"
echo
echo "  ${BOLD}Site public   :${RESET} ${CYAN}$PUBLIC_URL${RESET}"
[[ "$INSTALL_ADMIN" == "true" ]] && \
  echo "  ${BOLD}Panel admin   :${RESET} ${CYAN}$PUBLIC_URL/admin${RESET}"
echo "  ${BOLD}Login admin   :${RESET} ${CYAN}$ADMIN_USER${RESET}"
echo
echo "${DIM}  Commandes utiles :${RESET}"
echo "    ${GRAY}systemctl status $SERVICE_NAME${RESET}       ${DIM}# statut du service${RESET}"
echo "    ${GRAY}journalctl -u $SERVICE_NAME -f${RESET}       ${DIM}# logs en direct${RESET}"
echo "    ${GRAY}systemctl restart $SERVICE_NAME${RESET}      ${DIM}# redémarrer${RESET}"
echo "    ${GRAY}nano $INSTALL_DIR/.env${RESET}  ${DIM}# éditer la config${RESET}"
echo
echo "${DIM}  Log d'installation : $INSTALL_LOG${RESET}"
echo
