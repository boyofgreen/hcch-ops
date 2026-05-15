# HCCC Ops — Agent Notes

Internal compliance operations site for Hill Country Cider House. Used for TABC monthly reporting.

**GitHub**: https://github.com/boyofgreen/hcch-ops  
**Azure**: https://hccc-ops.azurewebsites.net

## Project Structure

```
ops/
├── db/              # Drizzle schema, client, migrations, seed
│   ├── client.ts    # SQLite client (node:sqlite + drizzle-orm/sqlite-proxy)
│   ├── schema.ts    # Table definitions
│   ├── seed.ts      # Seeds ciders/locations from xlsx
│   └── migrations/  # SQL migration files (applied at server startup)
├── server/          # Fastify API server
│   └── src/
│       ├── index.ts # Entry point — uses process.cwd() for all paths
│       └── routes/  # ciders, entries, locations, locks, reports
└── web/             # React + Vite frontend
    └── src/
        ├── App.tsx
        ├── api.ts
        └── pages/
            ├── EntryGrid.tsx   # Monthly entry tables + compliance calc panel
            └── AdminCiders.tsx # Add/toggle/delete ciders
```

## Dev

```bash
npm run dev          # starts server (tsx watch) + web (vite) concurrently
npm run db:seed      # re-seed ciders from xlsx (closes any open WAL first)
```

The dev database lives at `db/dev.db` (SQLite, WAL mode). The `-shm` and `-wal`
files are normal; they merge back into `dev.db` when all connections close.

## Build

```bash
# Build both packages (web first, then server)
npm run build --workspace=web
node_modules/.bin/tsc -p server/tsconfig.json
```

**Important**: The server tsconfig has `rootDir: ".."` so compiled output lands at
`server/dist/server/src/index.js` (not `server/dist/index.js`). All path resolution
in the server uses `process.cwd()` (= project root in both dev and production).

## Deploy to Azure

### One-time setup (already done)
- Resource group: `hccc-ops-rg` (South Central US)
- App Service Plan: `hccc-ops-plan` (B1 Basic — no CPU quota)
- Web App: `hccc-ops` (Node 22 LTS, Linux)
- App settings: `DATABASE_URL=file:/home/site/ops-data/dev.db`, `NODE_ENV=production`
- Startup command: `node server/server/src/index.js`

The production DB lives at `/home/site/ops-data/dev.db` (outside wwwroot so it
survives redeployments). On first start, `db/client.ts` automatically copies the
seed DB from `wwwroot/db/dev.db` if the production DB is missing or empty.

### Deploy steps

```bash
# 1. Checkpoint the WAL so dev.db has all data (if dev server was running)
node --input-type=module --eval "
  import { DatabaseSync } from 'node:sqlite';
  const db = new DatabaseSync('db/dev.db');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
"

# 2. Build
npm run build --workspace=web
node_modules/.bin/tsc -p server/tsconfig.json

# 3. Assemble staging directory
mkdir -p staging/server staging/web/dist staging/db/migrations
cp -r server/dist/. staging/server/
cp server/package.json staging/server/
cp -r web/dist/. staging/web/dist/
cp db/dev.db staging/db/
cp db/migrations/*.sql staging/db/migrations/
cat > staging/package.json << 'EOF'
{
  "name": "hccc-ops",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "server/server/src/index.js",
  "scripts": { "start": "node server/server/src/index.js" },
  "dependencies": {
    "@fastify/static": "^7.0.4",
    "drizzle-orm": "^0.38.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  }
}
EOF

# 4. Deploy (az webapp up creates the zip correctly with forward slashes)
cd staging && az webapp up \
  --name hccc-ops \
  --resource-group hccc-ops-rg \
  --runtime "NODE:22-lts" \
  --sku B1 \
  --os-type Linux
cd ..
```

### Why az webapp up (not Compress-Archive + az webapp deploy)
PowerShell's `Compress-Archive` writes Windows backslashes into the zip, which
breaks Kudu's rsync on Linux. `az webapp up` creates its own zip correctly.

### Kudu access (for debugging)
```bash
# Run a shell command on the container
TOKEN=$(az account get-access-token --query accessToken -o tsv)
curl -X POST https://hccc-ops.scm.azurewebsites.net/api/command \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash -c \"ls /home/site/wwwroot/\"","dir":"/"}'
```

## Key Gotchas

- **WAL checkpoint before deploy**: If `db/dev.db` is only 4KB, all data is in
  `dev.db-wal`. Run the checkpoint command above or close the dev server first.
- **B1 tier required**: F1 (free) has a 60-min/day CPU quota. A crash-looping
  server eats it in minutes and locks out the Kudu deploy endpoint too.
- **Path resolution**: `db/client.ts` uses `isAbsolute()` to handle the absolute
  `DATABASE_URL` path on Azure; relative paths resolve from `process.cwd()`.
