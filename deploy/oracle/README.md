# Backend en Oracle Cloud (Always Free)

Guía para correr el backend NestJS + Redis + HTTPS (Caddy) en una máquina
virtual gratuita de Oracle Cloud. Tiempo estimado: 1 a 2 horas la primera vez.

## Condiciones del plan gratuito (verificadas en la documentación oficial, sept. 2026)

- **Gratis y sin plazo**: los recursos "Always Free" son gratuitos "for the life
  of the account". La prueba de USD 300 dura 30 días; al terminar, los recursos
  Always Free siguen activos.
- **Tarjeta obligatoria** para verificar identidad (solo una retención temporal).
  No se aceptan débito con PIN, prepagas ni tarjetas virtuales.
- **Máquina Ampere A1 (Arm)**: hasta 2 OCPU y 12 GB de RAM en total, 200 GB de
  disco y 10 TB/mes de tráfico saliente.
- **Riesgo 1, instancia "ociosa"**: Oracle puede recuperar una instancia si en 7
  días el CPU (percentil 95), la red **y** la memoria están por debajo del 20 %.
  Por eso se usa una máquina chica (1 OCPU / 2 GB): el backend + Redis + Docker
  ocupan más del 20 % de 2 GB de RAM. Verificarlo con `free -m` (paso 10).
- **Riesgo 2, cuenta abandonada**: una cuenta sin actividad durante 30 días puede
  suspenderse. Entrar a la consola de Oracle al menos una vez por mes.
- **Región**: se elige al registrarse y **no se puede cambiar**. La base de
  Supabase está en EE. UU. oeste (Oregón); elegir **US West (San Jose)** o
  **US West (Phoenix)** para que las consultas a la base sean rápidas.

## 0. Antes de empezar

Copiar de Railway (Variables → vista Raw) todas las variables del backend y
guardarlas en un lugar seguro. Se cargan en el paso 7.

## 1. Crear la cuenta

1. Registrarse en https://www.oracle.com/cloud/free/ con la región del punto anterior.
2. Esperar el correo de activación (puede tardar unos minutos).

## 2. Crear la máquina virtual

En la consola: **Compute → Instances → Create instance**.

1. **Image**: Canonical Ubuntu 24.04 (la versión *aarch64*, no la *Minimal*).
2. **Shape**: *Change shape* → **Ampere** → `VM.Standard.A1.Flex`, **1 OCPU** y
   **2 GB** de memoria. Debe aparecer la etiqueta *Always Free-eligible*.
3. **Networking**: crear una VCN nueva con subred pública y **asignar IPv4 pública**.
4. **SSH keys**: *Generate a key pair* y descargar la clave privada.
5. **Create**. Si aparece "Out of host capacity", probar otro *availability
   domain* o reintentar más tarde (es falta temporal de máquinas gratuitas).
6. Anotar la **IP pública** de la instancia.

## 3. Abrir los puertos 80 y 443

1. En la instancia: **Subnet → Security List → Add Ingress Rules**, dos reglas:
   origen `0.0.0.0/0`, protocolo TCP, puerto destino `80`; y lo mismo con `443`.
2. Conectarse por SSH (reemplazar la ruta de la clave y la IP):

   ```bash
   chmod 600 ~/Descargas/ssh-key.key
   ssh -i ~/Descargas/ssh-key.key ubuntu@IP_PUBLICA
   ```

3. Ya dentro del servidor, abrir los puertos en el firewall de Ubuntu (las
   imágenes de Oracle bloquean todo salvo SSH):

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 4. Preparar el servidor

```bash
# Actualizaciones de seguridad automáticas
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y unattended-upgrades git

# 2 GB de swap: la compilación del backend necesita más que la RAM disponible
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit   # salir y volver a entrar por SSH para que tome el grupo docker
```

## 5. Dominio con HTTPS gratis

Se usa [sslip.io](https://sslip.io): un nombre que apunta solo a la IP, sin
registrar nada. Con la IP `129.146.10.20` el dominio es
`129-146-10-20.sslip.io`. Caddy obtiene el certificado HTTPS automáticamente.

Si el certificado falla por límite de Let's Encrypt, alternativa gratuita:
crear un subdominio en https://www.duckdns.org apuntando a la misma IP.

## 6. Descargar el código

El repositorio es privado: se usa una *deploy key* de solo lectura.

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub
```

Copiar la clave pública en GitHub: repositorio → **Settings → Deploy keys →
Add deploy key** (sin permiso de escritura). Luego:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:javierortix56-dot/clinica-saas.git
cd clinica-saas/deploy/oracle
```

## 7. Variables de entorno

```bash
cp .env.example .env
nano .env
```

Completar con los valores copiados de Railway (paso 0), más:

| Variable | Valor |
|---|---|
| `DOMAIN` | el dominio del paso 5, sin `https://` |
| `GOOGLE_REDIRECT_URI` | `https://DOMAIN/auth/google/callback` |
| `GOOGLE_WEBHOOK_URL` | vacío (se deriva de la anterior) |
| `FRONTEND_URL` | la URL de producción de Vercel, sin `/` final |

No cargar `REDIS_URL` ni `PORT`: los define `docker-compose.yml`.

## 8. Levantar el backend

```bash
docker compose up -d --build      # la primera vez tarda 5–10 minutos
docker compose ps                 # los 3 servicios deben estar "running"
docker compose logs -f backend    # Ctrl+C para salir
curl https://DOMAIN/healthz       # debe responder {"status":"ok","db":"up","redis":"up"}
```

## 9. Conectar el resto de los servicios

1. **Vercel** → proyecto `clinica-saas-frontend` → Settings → Environment
   Variables → `NEXT_PUBLIC_API_URL` = `https://DOMAIN` (en Production y
   Preview) → **Redeploy** de producción.
2. **Google Cloud Console** → APIs y servicios → Credenciales → cliente OAuth →
   agregar `https://DOMAIN/auth/google/callback` en *URIs de redireccionamiento
   autorizados*.
3. **Google Search Console** → agregar propiedad *Prefijo de URL*
   `https://DOMAIN/` → método *Archivo HTML* → poner el nombre del archivo
   (ej. `google1a2b3c4d.html`) en `GOOGLE_SITE_VERIFICATION` del `.env` →
   `docker compose up -d` → **Verificar**.
4. **Meta (WhatsApp)** → configuración del webhook → URL
   `https://DOMAIN/webhooks/whatsapp` con el mismo token de verificación
   (`WHATSAPP_VERIFY_TOKEN`).
5. **En la app** → Equipo → Editar profesional → Google Calendar →
   Desconectar y volver a Conectar.

## 10. Mantenimiento

- **Actualizar tras cambios en `main`**:
  `cd ~/clinica-saas && git pull && cd deploy/oracle && docker compose up -d --build`
- **Uso de memoria** (debe quedar por encima de 20 % para que Oracle no la
  considere ociosa): `free -m`, columna *used* / *total*.
- **Reinicios**: los contenedores vuelven solos al reiniciar la máquina
  (`restart: unless-stopped`).
- Entrar a la consola de Oracle al menos una vez por mes.
