#!/bin/bash

# Script to open Prisma Studio connected to Railway database
# This gives you a visual interface to browse all your raw data

RAILWAY_DB_URL="postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway"

echo "🚀 Opening Prisma Studio..."
echo "📊 Connecting to Railway database..."
echo ""
echo "✅ Prisma Studio will open at: http://localhost:5555"
echo "📝 You can browse, search, and view all your raw data there!"
echo ""
echo "Press Ctrl+C to stop Prisma Studio when you're done."
echo ""

# Set DATABASE_URL and run Prisma Studio
DATABASE_URL="$RAILWAY_DB_URL" npx prisma studio






