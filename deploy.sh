#!/bin/bash
set -e

# Civic Compass Production Deployment
# Server: 173.212.214.147 (civic.iranians.vote)
# Usage: ./deploy.sh [pull|start|stop|restart|logs|status|seed]

DEPLOY_DIR="/opt/civic-compass"
REPO_URL="https://github.com/jomhoor/civic-backend.git"
BRANCH="main"
COMPOSE_FILE="docker-compose.production.yml"

cd "$DEPLOY_DIR"

case "$1" in
  pull)
    echo "📥 Pulling latest changes..."
    if [ -d "repo" ]; then
      cd repo && git fetch origin && git reset --hard "origin/$BRANCH"
    else
      git clone --branch "$BRANCH" "$REPO_URL" repo
    fi
    echo "✅ Pull complete"
    ;;

  start)
    echo "🚀 Starting Civic Compass..."
    cd repo

    if [ ! -f .env ]; then
      echo "⚠️  No .env file found. Copy from .env.production.example:"
      echo "    cp .env.production.example .env && nano .env"
      exit 1
    fi

    docker compose -f "$COMPOSE_FILE" up -d --build
    echo "✅ Services started"
    docker compose -f "$COMPOSE_FILE" ps
    ;;

  stop)
    echo "🛑 Stopping Civic Compass..."
    cd repo
    docker compose -f "$COMPOSE_FILE" down
    echo "✅ Services stopped"
    ;;

  restart)
    echo "🔄 Restarting..."
    "$0" stop
    "$0" start
    ;;

  logs)
    cd repo
    docker compose -f "$COMPOSE_FILE" logs -f ${2:-}
    ;;

  status)
    cd repo
    docker compose -f "$COMPOSE_FILE" ps
    ;;

  seed)
    echo "🌱 Seeding questionnaires..."
    curl -s -X POST http://127.0.0.1:3001/api/questions/seed?force=true | head -c 500
    echo ""
    echo "✅ Seed complete"
    ;;

  update)
    echo "📦 Full update: pull + rebuild + restart..."
    "$0" pull
    "$0" stop
    "$0" start
    ;;

  *)
    echo "Civic Compass Deployment"
    echo ""
    echo "Usage: $0 {pull|start|stop|restart|logs|status|seed|update}"
    echo ""
    echo "  pull     - Pull latest code from GitHub"
    echo "  start    - Build & start all services"
    echo "  stop     - Stop all services"
    echo "  restart  - Stop + start"
    echo "  logs     - Show logs (optional: logs civic-backend)"
    echo "  status   - Show service status"
    echo "  seed     - Seed questionnaires (force)"
    echo "  update   - Pull + rebuild + restart"
    exit 1
    ;;
esac
