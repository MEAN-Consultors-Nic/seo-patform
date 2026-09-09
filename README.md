# SEO Platform — Media Spearhead

Specialized workbench for an SEO strategist: clients, keywords, positions,
competitors, backlinks, content pipeline, cannibalization, indexing, link
graph, GSC/GA4/GBP insights, tasks, and client-facing reports.

Briefly renamed to "Internal Tools" in July 2026 while an agency-ops layer
(sales pipeline, proposals, questionnaires, bulk email, packages) was built
on top. That layer was removed on 2026-09-08 — the team runs those workflows
on a dedicated platform — and the tool is back to its original single
purpose.

## Stack

- **Monorepo:** Nx 22 (pnpm)
- **Backend:** NestJS 11 (TypeScript)
- **Frontend:** Angular 21 (standalone components, signals, Tailwind CSS)
- **Database:** MongoDB 7
- **Email:** nodemailer + SMTP
- **PDF:** pdfmake
- **Shared types:** `libs/shared` (importable as `@seo/shared`)

```
seo-platform/
├── apps/
│   ├── api/         NestJS backend
│   └── web/         Angular frontend
├── libs/
│   └── shared/      Shared TS types
├── docker/          Dockerfiles + nginx
├── docker-compose.yml
├── Procfile         Heroku
├── vercel.json      Vercel
└── .env.example
```

## Quickstart (local with Docker)

```bash
cp .env.example .env
# Edit .env and fill SMTP_USER, SMTP_PASS, etc.
docker compose up -d --build
```

- API: http://localhost:3000/api
- Web: http://localhost:4200
- Mongo Express: http://localhost:8081

## Scripts (pnpm)

```bash
pnpm dev          # API + Web in parallel (no Docker)
pnpm dev:api      # API only
pnpm dev:web      # Web only
pnpm db:up        # Mongo + mongo-express in Docker only
pnpm db:down      # stop Mongo
pnpm build        # build API + Web
pnpm build:api    # API only
pnpm build:web    # Web only
pnpm start        # node dist/apps/api/main.js (production)
pnpm lint         # lint every project
pnpm typecheck    # type-check every project
```

## Deployment

### Backend → Heroku

```bash
# Once per project
heroku create seo-platform-api --buildpack heroku/nodejs

# Environment (minimum)
heroku config:set \
  NODE_ENV=production \
  MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER/internal-tools" \
  JWT_SECRET="$(openssl rand -base64 32)" \
  PUBLIC_WEB_URL="https://tools.mediaspearhead.com" \
  CORS_ORIGINS="https://tools.mediaspearhead.com,https://seo-tracker.mediaspearhead.com" \
  SMTP_HOST=mail.mediaspearhead.com \
  SMTP_PORT=587 \
  SMTP_SECURE=false \
  SMTP_USER=seo@notifications.mediaspearhead.com \
  SMTP_PASS='YOUR_PASSWORD_HERE' \
  SMTP_FROM_NAME="Media Spearhead — SEO Platform" \
  SMTP_FROM_EMAIL=seo@notifications.mediaspearhead.com

# Deploy
git push heroku main
```

Heroku detects `pnpm` via `packageManager` in `package.json` and runs:
1. `pnpm install --frozen-lockfile`
2. `pnpm heroku-postbuild` → runs `pnpm build:api` → produces `dist/apps/api`
3. `pnpm start` → `node dist/apps/api/main.js` (reads `process.env.PORT`)

### Frontend → Vercel

1. **Edit `apps/web/src/environments/environment.prod.ts`** and set `apiBase` to the real Heroku URL.
2. Connect the repo at https://vercel.com/new — Vercel reads `vercel.json`:
   - Install: `pnpm install --frozen-lockfile`
   - Build: `pnpm exec nx build web --configuration=production`
   - Output: `dist/apps/web/browser`
3. SPA routes (`/r/:token`, `/clients/:id`, etc.) rewrite to `index.html` via `vercel.json`.

### Database → MongoDB Atlas

1. Create an M0 cluster at https://cloud.mongodb.com
2. Whitelist `0.0.0.0/0` (or Heroku IPs)
3. Create a DB user and copy the connection string to `MONGODB_URI`

## Environment variables

See `.env.example`. Production keys:

| Var | Description |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | JWT signing secret (auth + PDF unlock token) |
| `PUBLIC_WEB_URL` | Frontend URL (used to build share links in outbound email) |
| `CORS_ORIGINS` | Comma-separated allowed origins; accepts regex via `/.../`  |
| `SMTP_*` | SMTP server credentials |

## Roles (current)

- **root** — full control including user management.
- **seo-manager** — sees/edits every client; can't manage users.
- **seo-strategist** — sees/edits only clients where they are `ownerId`.

The live hierarchy is `root · owner · admin · manager · strategist`, with
`manager` scoped to their own strategists' clients and `strategist` scoped to
clients they own. A `supervisor` role still exists on the user model for
historical task comments.

## Module layout

Backend modules are grouped into domain barrels so `AppModule` imports six
things instead of twenty-five:

| Barrel | Contents |
|---|---|
| `core/` | auth, users, roles, app-settings, activity log |
| `clients/` | client CRUD, contacts, credentials, service areas, files, notes |
| `seo/` | keywords, competitors, backlinks, content, cannibalization, indexing, link graph |
| `work/` | tasks, task templates, cycles (legacy compat), priority queue |
| `integrations/` | Google (GSC/GA4/GBP/Docs/Drive), Shopify, WordPress, SMTP |
| `tools/` | domain lookup, schema modeller |
| `reports/` | report editor, PDF / Word / public share |

## Handy commands

```bash
# Container logs
docker compose logs -f api
docker compose logs -f web

# Reset DB (WARNING — wipes everything and re-seeds)
docker compose down -v

# Mongo shell
docker compose exec mongo mongosh seo-platform
```
