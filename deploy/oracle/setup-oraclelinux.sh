#!/bin/bash
# Configuración del backend en Oracle Cloud, para Oracle Linux 9 (dnf/firewalld).
# Se corre UNA VEZ por SSH: pegar el bloque completo (con GITHUB_TOKEN y las
# claves de Railway ya completados) en la sesión SSH conectada como `opc`.
# Progreso: /var/log/clinica-setup.log  ·  Fin OK: /var/log/clinica-setup.done
#
# ANTES DE PEGARLO: completar GITHUB_TOKEN y los valores >>> RAILWAY.
# Este archivo con valores reales NO se sube a GitHub.

# ============================ COMPLETAR ======================================
GITHUB_TOKEN="PEGAR_TOKEN_DE_GITHUB"
BRANCH="claude/kind-brown-q6uelu"

sudo tee /root/clinica.env > /dev/null <<'ENVEOF'
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
sudo bash -c 'exec > >(tee -a /var/log/clinica-setup.log) 2>&1'

# Swap de 2 GB: la compilación del backend necesita más que la RAM disponible.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# Puertos 80/443: firewalld si está activo (estándar en OL9), si no, iptables
# insertado al principio de la cadena (evaluado antes que cualquier REJECT).
if sudo systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --permanent --add-port=80/tcp
  sudo firewall-cmd --permanent --add-port=443/tcp
  sudo firewall-cmd --reload
else
  sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
  sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo service iptables save 2>/dev/null || true
fi

# Docker CE (repo oficial compatible con Oracle Linux / RHEL 9).
sudo dnf install -y dnf-plugins-core git
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker opc

IP="$(curl -fsS https://api.ipify.org)"
DOMAIN="${IP//./-}.sslip.io"

APP=/home/opc/clinica-saas
if [ ! -d "$APP" ]; then
  sudo git clone --branch "$BRANCH" "https://x-access-token:${GITHUB_TOKEN}@github.com/javierortix56-dot/clinica-saas.git" "$APP"
  sudo git -C "$APP" remote set-url origin https://github.com/javierortix56-dot/clinica-saas.git
fi

sudo sed "s/__DOMAIN__/${DOMAIN}/g" /root/clinica.env | sudo tee "$APP/deploy/oracle/.env" > /dev/null
sudo chmod 600 "$APP/deploy/oracle/.env"
sudo rm -f /root/clinica.env
sudo chown -R opc:opc "$APP"

cd "$APP/deploy/oracle"
sudo docker compose up -d --build

echo "https://${DOMAIN}" | sudo tee /var/log/clinica-setup.done
