#!/bin/bash
set -e

# ══════════════════════════════════════════════════════════
# Civic Compass — Production Deployment
# Domain: civic.jomhoor.org
# ══════════════════════════════════════════════════════════
#
# First-time setup:
#   1. Clone backend:  git clone https://github.com/jomhoor/civic-backend.git /opt/civic-compass/backend
#   2. Clone web:      git clone https://github.com/jomhoor/civic-web.git /opt/civic-compass/web
#   3. Run:            /opt/civic-compass/backend/deploy/deploy.sh setup
#   4. Edit secrets:   nano /opt/civic-compass/.env.production
#   5. Get SSL:        /opt/civic-compass/backend/deploy/deploy.sh ssl-init
#   6. Start:          /opt/civic-compass/backend/deploy/deploy.sh start
#   7. Seed data:      /opt/civic-compass/backend/deploy/deploy.sh seed

DEPLOY_DIR="/opt/civic-compass"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="civic.jomhoor.org"

COMPOSE="docker compose -f $DEPLOY_DIR/docker-compose.production.yml --env-file $DEPLOY_DIR/.env.production"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# Copy deployment files from backend/deploy/ to project root
sync_deploy_files() {
  echo "Syncing deployment files..."
  cp "$SCRIPT_DIR/docker-compose.production.yml" "$DEPLOY_DIR/"
  cp -r "$SCRIPT_DIR/nginx" "$DEPLOY_DIR/"
  mkdir -p "$DEPLOY_DIR/certbot/conf" "$DEPLOY_DIR/certbot/www"
  log "Deployment files synced"
}

check_env() {
  if [ ! -f "$DEPLOY_DIR/.env.production" ]; then
    err "No .env.production found. Run:\n  cp $DEPLOY_DIR/.env.production.example $DEPLOY_DIR/.env.production\n  nano $DEPLOY_DIR/.env.production"
  fi
}

case "${1:-help}" in

  # ── First-time server setup ────────────────────────────
  setup)
    echo "═══ Civic Compass — Server Setup ═══"

    command -v docker >/dev/null 2>&1 || err "Docker not installed"
    docker compose version >/dev/null 2>&1 || err "Docker Compose not available"

    # Ensure repos are cloned
    [ -d "$DEPLOY_DIR/backend" ] || err "Backend not found. Clone: git clone https://github.com/jomhoor/civic-backend.git $DEPLOY_DIR/backend"
    [ -d "$DEPLOY_DIR/web" ] || err "Web not found. Clone: git clone https://github.com/jomhoor/civic-web.git $DEPLOY_DIR/web"

    # Copy deploy files to project root
    sync_deploy_files

    # Create .env from template
    if [ ! -f "$DEPLOY_DIR/.env.production" ]; then
      cp "$SCRIPT_DIR/.env.production.example" "$DEPLOY_DIR/.env.production"
      # Generate secrets automatically
      sed -i "s/CHANGE_ME_use_a_strong_password/$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)/" "$DEPLOY_DIR/.env.production"
      sed -i "s/CHANGE_ME_use_openssl_rand_hex_32/$(openssl rand -hex 32)/" "$DEPLOY_DIR/.env.production"
      log "Created .env.production with generated secrets"
      echo "  Review: cat $DEPLOY_DIR/.env.production"
    else
      warn ".env.production already exists, skipping"
    fi

    log "Setup complete. Next steps:"
    echo "  1. Review: cat $DEPLOY_DIR/.env.production"
    echo "  2. Get SSL: $0 ssl-init"
    echo "  3. Start: $0 start"
    ;;

  # ── SSL certificate (first time) ──────────────────────
  ssl-init)
    echo "═══ SSL Certificate Setup ═══"
    check_env
    sync_deploy_files

    # Use init config (HTTP only) for ACME challenge
    if [ -f "$DEPLOY_DIR/nginx/conf.d/civic.conf" ]; then
      mv "$DEPLOY_DIR/nginx/conf.d/civic.conf" "$DEPLOY_DIR/nginx/conf.d/civic.conf.bak"
    fi

    echo "Starting nginx for ACME challenge..."
    $COMPOSE up -d nginx
    sleep 3

    read -p "Enter your email for Let's Encrypt: " LE_EMAIL
    $COMPOSE run --rm certbot certonly \
      --webroot -w /var/www/certbot \
      -d "$DOMAIN" \
      --email "$LE_EMAIL" \
      --agree-tos \
      --no-eff-email

    # Restore full SSL config
    if [ -f "$DEPLOY_DIR/nginx/conf.d/civic.conf.bak" ]; then
      mv "$DEPLOY_DIR/nginx/conf.d/civic.conf.bak" "$DEPLOY_DIR/nginx/conf.d/civic.conf"
    fi
    rm -f "$DEPLOY_DIR/nginx/conf.d/civic-init.conf"

    $COMPOSE restart nginx
    log "SSL certificate obtained for $DOMAIN"
    ;;

  # ── SSL renewal ────────────────────────────────────────
  ssl-renew)
    $COMPOSE run --rm certbot renew
    $COMPOSE restart nginx
    log "SSL renewal complete"
    ;;

  # ── Start all services ─────────────────────────────────
  start)
    echo "═══ Starting Civic Compass ═══"
    check_env
    sync_deploy_files
    $COMPOSE up -d --build
    sleep 5
    $COMPOSE ps
    log "Services started — https://$DOMAIN"
    ;;

  # ── Stop all services ──────────────────────────────────
  stop)
    $COMPOSE down
    log "Services stopped"
    ;;

  # ── Restart ────────────────────────────────────────────
  restart)
    check_env
    sync_deploy_files
    $COMPOSE down
    $COMPOSE up -d --build
    log "Restarted — https://$DOMAIN"
    ;;

  # ── Pull latest + rebuild ──────────────────────────────
  update)
    echo "═══ Updating Civic Compass ═══"
    check_env

    echo "Pulling backend..."
    cd "$DEPLOY_DIR/backend" && git pull origin main
    echo "Pulling web..."
    cd "$DEPLOY_DIR/web" && git pull origin main

    sync_deploy_files

    echo "Rebuilding..."
    $COMPOSE up -d --build
    sleep 5
    $COMPOSE ps
    log "Update complete — https://$DOMAIN"
    ;;

  # ── Logs ───────────────────────────────────────────────
  logs)
    $COMPOSE logs -f ${2:-}
    ;;

  # ── Status ─────────────────────────────────────────────
  status)
    $COMPOSE ps
    ;;

  # ── Seed questionnaires ────────────────────────────────
  seed)
    echo "Seeding questionnaires..."
    $COMPOSE exec civic-backend sh -c 'wget -qO- http://localhost:3001/api/questions/seed?force=true' 2>/dev/null || \
      curl -s -X POST http://127.0.0.1:3001/api/questions/seed?force=true
    echo ""
    log "Seed complete"
    ;;

  # ── Database backup ────────────────────────────────────
  backup)
    BACKUP_FILE="$DEPLOY_DIR/civic_backup_$(date +%Y%m%d_%H%M%S).sql"
    $COMPOSE exec civic-db pg_dump -U civic civic_compass > "$BACKUP_FILE"
    log "Backup saved: $BACKUP_FILE"
    ;;

  # ── Shell ──────────────────────────────────────────────
  shell)
    $COMPOSE exec "${2:-civic-backend}" sh
    ;;

  # ── Help ───────────────────────────────────────────────
  *)
    echo "╔══════════════════════════════════════╗"
    echo "║   Civic Compass — Deployment CLI     ║"
    echo "║   https://civic.jomhoor.org          ║"
    echo "╚══════════════════════════════════════╝"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup       First-time server setup (generates secrets)"
    echo "  ssl-init    Obtain SSL certificate (run once)"
    echo "  ssl-renew   Renew SSL certificate"
    echo "  start       Build & start all services"
    echo "  stop        Stop all services"
    echo "  restart     Stop + rebuild + start"
    echo "  update      Git pull + rebuild + restart"
    echo "  logs        Show logs (optional: logs civic-backend)"
    echo "  status      Show service status"
    echo "  seed        Seed questionnaires"
    echo "  backup      Backup database"
    echo "  shell       Open shell (optional: shell civic-web)"
    exit 1
    ;;
esac
