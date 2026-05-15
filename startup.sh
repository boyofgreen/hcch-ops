#!/bin/bash
# On first deployment, copy the seed database to persistent storage outside wwwroot.
# Subsequent deploys leave the production DB untouched.

DB_DIR="/home/site/ops-data"
PROD_DB="$DB_DIR/dev.db"
SEED_DB="/home/site/wwwroot/db/dev.db"

mkdir -p "$DB_DIR"

if [ ! -f "$PROD_DB" ] && [ -f "$SEED_DB" ]; then
  echo "First run: initializing production database from seed..."
  cp "$SEED_DB" "$PROD_DB"
  echo "Database initialized at $PROD_DB"
fi

echo "Starting server..."
exec node /home/site/wwwroot/server/dist/index.js
