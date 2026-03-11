#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# Nocrato Health V2 — Script de deploy inicial
# Hostinger VPS (Ubuntu 22.04 LTS)
#
# USO: executar UMA VEZ no servidor recém-provisionado
#   sudo bash deploy.sh
#
# Pré-requisitos:
#   - Ubuntu 22.04 LTS (fresh)
#   - Acesso root ou sudo sem senha
#   - DNS de app.nocrato.com já apontando para o IP do servidor
#   - Repositório no GitHub (REPO_URL abaixo)
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

# ──────────────────────────────────────────
# Configuração — ajuste antes de executar
# ──────────────────────────────────────────
REPO_URL="https://github.com/seuusuario/nocrato-health-v2.git"
APP_DIR="/opt/nocrato-health-v2"
DOMAIN="app.nocrato.com"
CERTBOT_EMAIL="devops@nocrato.com.br"

# Nota: --env-file é obrigatório porque o compose file fica em docker/
# e o Docker Compose procura .env no mesmo diretório do compose file.
# Com --env-file apontando para a raiz, a interpolação ${VAR} funciona corretamente.
COMPOSE="docker compose -f $APP_DIR/docker/docker-compose.prod.yml --env-file $APP_DIR/.env"

# ──────────────────────────────────────────
# Funções utilitárias
# ──────────────────────────────────────────
log() {
  echo ""
  echo "══════════════════════════════════════════"
  echo "  $1"
  echo "══════════════════════════════════════════"
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "ERRO: execute como root (sudo bash deploy.sh)"
    exit 1
  fi
}

# ──────────────────────────────────────────
# 1. Verificações iniciais
# ──────────────────────────────────────────
check_root

log "1/10 Verificando pré-requisitos"

# Verifica se o DNS já resolve para este servidor (necessário para Certbot)
SERVER_IP=$(curl -s https://api.ipify.org)
RESOLVED_IP=$(dig +short "$DOMAIN" | tail -1)

if [[ "$RESOLVED_IP" != "$SERVER_IP" ]]; then
  echo "AVISO: $DOMAIN resolve para $RESOLVED_IP mas este servidor é $SERVER_IP"
  echo "O Certbot pode falhar se o DNS não estiver propagado."
  echo "Pressione Enter para continuar mesmo assim, ou Ctrl+C para abortar."
  read -r
fi

# ──────────────────────────────────────────
# 2. Atualizar sistema e instalar dependências
# ──────────────────────────────────────────
log "2/10 Atualizando sistema"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl \
  wget \
  git \
  ufw \
  certbot \
  dnsutils \
  ca-certificates \
  gnupg \
  lsb-release

# ──────────────────────────────────────────
# 3. Configurar UFW (firewall)
# Regra: somente SSH (22), HTTP (80) e HTTPS (443)
# ──────────────────────────────────────────
log "3/10 Configurando firewall (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP (redirect para HTTPS)'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
ufw status verbose

# ──────────────────────────────────────────
# 4. Instalar Docker e Docker Compose plugin
# ──────────────────────────────────────────
log "4/10 Instalando Docker"

# Remove versões antigas se existirem
apt-get remove -y -qq docker docker-engine docker.io containerd runc 2>/dev/null || true

# Adiciona o repositório oficial Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verifica instalação
docker --version
docker compose version

# Inicia Docker e habilita no boot
systemctl enable docker
systemctl start docker

# ──────────────────────────────────────────
# 5. Clonar o repositório
# ──────────────────────────────────────────
log "5/10 Clonando repositório"

if [[ -d "$APP_DIR" ]]; then
  echo "Diretório $APP_DIR já existe — fazendo git pull"
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ──────────────────────────────────────────
# 6. Configurar variáveis de ambiente
# ──────────────────────────────────────────
log "6/10 Configurando .env"

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "ATENÇÃO: o arquivo .env foi criado a partir do .env.example."
  echo "Preencha os valores antes de continuar:"
  echo ""
  echo "  nano $APP_DIR/.env"
  echo ""
  echo "Variáveis obrigatórias:"
  echo "  DB_PASSWORD         — openssl rand -hex 32"
  echo "  JWT_SECRET          — openssl rand -hex 64"
  echo "  JWT_REFRESH_SECRET  — openssl rand -hex 64"
  echo "  RESEND_API_KEY      — https://resend.com"
  echo "  EVOLUTION_API_KEY   — definir antes de subir o Evolution"
  echo "  EVOLUTION_WEBHOOK_TOKEN — openssl rand -hex 32"
  echo "  OPENAI_API_KEY      — https://platform.openai.com"
  echo ""
  echo "Pressione Enter após preencher o .env para continuar."
  read -r
else
  echo ".env já existe — pulando criação"
fi

# Protege o .env (apenas root pode ler)
chmod 600 "$APP_DIR/.env"

# ──────────────────────────────────────────
# 7. Emitir certificado SSL (Let's Encrypt)
# Certbot standalone: nginx ainda não está rodando
# ──────────────────────────────────────────
log "7/10 Emitindo certificado SSL (Let's Encrypt)"

# Verifica se o certificado já existe (renovação posterior feita pelo cron)
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --domain "$DOMAIN"
  echo "Certificado emitido com sucesso para $DOMAIN"
else
  echo "Certificado já existe — pulando emissão"
fi

# Configura renovação automática via cron (a cada 12h)
(crontab -l 2>/dev/null; echo "0 */12 * * * certbot renew --quiet --deploy-hook '$COMPOSE restart nginx'") | sort -u | crontab -
echo "Renovação automática configurada (cron 0 */12 * * *)"

# ──────────────────────────────────────────
# 8. Build das imagens Docker
# ──────────────────────────────────────────
log "8/10 Fazendo build das imagens Docker"

cd "$APP_DIR"
$COMPOSE build --no-cache

# ──────────────────────────────────────────
# 9. Subir banco e rodar migrations
# Migrations rodam ANTES de subir a API para evitar janela de schema inconsistente
# ──────────────────────────────────────────
log "9/10 Subindo PostgreSQL e rodando migrations"

# Sobe apenas o banco
$COMPOSE up -d postgres

# Aguarda o healthcheck passar (pg_isready)
echo "Aguardando PostgreSQL ficar saudável..."
RETRIES=30
until $COMPOSE exec -T postgres \
  pg_isready -U "$(grep DB_USER "$APP_DIR/.env" | cut -d= -f2)" \
  -d "$(grep DB_NAME "$APP_DIR/.env" | cut -d= -f2)" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -eq 0 ]]; then
    echo "ERRO: PostgreSQL não ficou saudável a tempo"
    $COMPOSE logs postgres
    exit 1
  fi
  echo "  aguardando... ($RETRIES tentativas restantes)"
  sleep 2
done
echo "PostgreSQL saudável."

# Roda migrations com o container da API
# migrate.ts é compilado explicitamente no Dockerfile.api via tsc (não pelo nest build)
# WORKDIR do container é /app/apps/api — dist/database/migrate.js é o caminho correto
$COMPOSE run --rm \
  -e NODE_ENV=production \
  api \
  node dist/database/migrate.js

echo "Migrations aplicadas com sucesso."

# ──────────────────────────────────────────
# 10. Subir todos os serviços
# ──────────────────────────────────────────
log "10/10 Subindo todos os serviços"

$COMPOSE up -d

# Aguarda a API responder no health check
echo "Aguardando API ficar disponível..."
RETRIES=30
until curl -sf "https://$DOMAIN/health" > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -eq 0 ]]; then
    echo "AVISO: health check não respondeu a tempo (pode ainda estar subindo)"
    echo "Verifique com: $COMPOSE logs api"
    break
  fi
  echo "  aguardando... ($RETRIES tentativas restantes)"
  sleep 3
done

# ──────────────────────────────────────────
# Resumo final
# ──────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Deploy concluído com sucesso!           ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Frontend:   https://$DOMAIN             "
echo "║  API:        https://$DOMAIN/api/v1      "
echo "║  Health:     https://$DOMAIN/health      "
echo "╠══════════════════════════════════════════╣"
echo "║  Comandos úteis:                          ║"
echo "║                                           ║"
echo "║  Ver logs:                                ║"
echo "║    $COMPOSE logs -f"
echo "║                                           ║"
echo "║  Status dos serviços:                     ║"
echo "║    $COMPOSE ps"
echo "║                                           ║"
echo "║  Rodar seed (dados iniciais):             ║"
echo "║    $COMPOSE run --rm -e NODE_ENV=production api node dist/database/seed.js"
echo "╚══════════════════════════════════════════╝"
