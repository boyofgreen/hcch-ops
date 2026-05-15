# Hill Country Cider House — Ops

Internal operations site. First module: **Compliance** — replaces the monthly Excel workflow used to compile numbers for TABC reporting (two licenses: Cider House and Tasting Room).

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind + TanStack Query
- **Backend:** Fastify + TypeScript (serves the React build and `/api/*`)
- **DB:** SQLite via Prisma
- **Deploy target:** Azure App Service Linux (B1)

## Getting started

```bash
npm install
npm run db:migrate    # creates prisma/dev.db and applies the schema
npm run db:seed       # seeds locations, ciders, and Jan–Mar 2026 from the xlsx
npm run dev           # starts API on :8080 and web dev server on :5173
```

Open <http://localhost:5173>.

## Useful scripts

| Script                  | What it does                                                     |
|-------------------------|------------------------------------------------------------------|
| `npm run dev`           | Run server + web in parallel (Vite proxies `/api` → :8080)       |
| `npm run db:migrate`    | Apply Prisma migrations to local SQLite                          |
| `npm run db:seed`       | Reseed reference data and import the 2026 spreadsheet            |
| `npm run db:reset`      | Drop + recreate the local DB, then run migrations & seed         |
| `npm run build`         | Build the web app and compile the server                         |
| `npm start`             | Start the compiled server (serves the built web app too)         |

## Deployment (Azure App Service)

1. Provision **App Service Linux (B1)** with Node 20.
2. Set startup command: `npm start`.
3. Set env vars:
   - `DATABASE_URL=file:/home/data/prod.db`
   - `PORT=8080`
4. Enable persistent `/home` storage (default on Linux App Service).
5. Push to GitHub; deploy via GitHub Actions or the Azure deployment center.

A GitHub Actions workflow will be added when we're ready to deploy.
