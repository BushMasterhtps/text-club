#!/bin/bash
# Opens Prisma Studio using DATABASE_URL from the environment (never hardcode credentials).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Export your PostgreSQL connection string, then re-run:"
  echo "  export DATABASE_URL='postgresql://…'"
  echo "  ./scripts/open-prisma-studio.sh"
  exit 1
fi

echo "🚀 Opening Prisma Studio..."
echo "📝 Prisma Studio: http://localhost:5555 (Ctrl+C to stop)"
echo ""

exec npx prisma studio
