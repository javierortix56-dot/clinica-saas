#!/bin/bash
# Script de inicialización para Oracle Cloud (Compute → Create instance →
# Advanced options → Management → Initialization script → Paste).
# Configura el servidor y levanta el backend sin entrar por SSH.
# Progreso: /var/log/clinica-setup.log  ·  Fin OK: /var/log/clinica-setup.done
#
# ANTES DE PEGARLO: completar GITHUB_TOKEN y los valores >>> RAILWAY.
# Este archivo con valores reales NO se sube a GitHub.

# ============================ COMPLETAR ======================================
# Token de GitHub de solo lectura (fine-grained, repo clinica-saas, Contents: Read-only)
GITHUB_TOKEN="PEGAR_TOKEN_DE_GITHUB"
BRANCH="claude/kind-brown-q6uelu"

cat > /root/clinica.env <<'ENVEOF'
# DOMAIN y GOOGLE_REDIRECT_URI se completan solos con la IP pública.
DOMAIN=__DOMAIN__
GOOGLE_REDIRECT_URI=https://__DOMAIN__/auth/google/callback
SUPABASE_URL=https://vdpmwilcnufrjljrnbco.supabase.co
FRONTEND_URL=https://clinica-saas-frontend.vercel.app
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
BOT_ACTOR_ID=f2275489-e1bc-49c6-8717-1b4c0cdfe1c3
WHATSAPP_REMINDER_TEMPLATE_LANG=es_AR
GOOGLE_WEBHOOK_URL=
GOOGLE_SITE_VERIFICATION=
# >>> RAILWAY: pegar los valores después del "="
DATABASE_URL=
DIRECT_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_REMINDER_TEMPLATE_24H=
WHATSAPP_REMINDER_TEMPLATE_4H=
ENVEOF
# =============================================================================

set -euxo pipefail
exec > /var/log/clinica-setup.log 2>&1
export DEBIAN_FRONTEND=noninteractive

# Swap de 2 GB: la compilación del backend necesita más que la RAM disponible.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Firewall de Ubuntu: las imágenes de Oracle solo permiten SSH.
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

apt-get update
apt-get install -y git unattended-upgrades
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

IP="$(curl -fsS https://api.ipify.org)"
DOMAIN="${IP//./-}.sslip.io"

APP=/home/ubuntu/clinica-saas
if [ ! -d "$APP" ]; then
  git clone --branch "$BRANCH" "https://x-access-token:${GITHUB_TOKEN}@github.com/javierortix56-dot/clinica-saas.git" "$APP"
  # El token no queda guardado en la configuración de git.
  git -C "$APP" remote set-url origin https://github.com/javierortix56-dot/clinica-saas.git
fi

sed "s/__DOMAIN__/${DOMAIN}/g" /root/clinica.env > "$APP/deploy/oracle/.env"
chmod 600 "$APP/deploy/oracle/.env"
rm -f /root/clinica.env
chown -R ubuntu:ubuntu "$APP"

cd "$APP/deploy/oracle"
docker compose up -d --build

echo "https://${DOMAIN}" > /var/log/clinica-setup.done
