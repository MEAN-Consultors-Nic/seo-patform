# Internal Tools — Media Spearhead

Agency operations platform for Media Spearhead. Started as an SEO-only toolset; being progressively modularized into a broader internal-tools suite (SEO, Clients, Reports, Tasks, Integrations — with Sales, Communications, PPC, and Ops digests planned).

Renamed from `seo-platform` on 2026-07-07. GitHub repo rename + custom domain change tracked as Phase 0 ops actions.

## Stack

- **Monorepo:** Nx 22 (pnpm)
- **Backend:** NestJS 11 (TypeScript)
- **Frontend:** Angular 21 (standalone components, signals, Tailwind CSS)
- **Database:** MongoDB 7
- **Email:** nodemailer + SMTP
- **PDF:** pdfmake
- **Shared types:** `libs/shared` (importable as `@seo/shared` — the alias will migrate to `@internal-tools/shared` in the module-restructure phase)

```
internal-tools/
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
heroku create internal-tools-api --buildpack heroku/nodejs

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
  SMTP_FROM_NAME="Media Spearhead — Internal Tools" \
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

Expansion to `root · owner · admin · manager · strategist · client` is planned as **Phase 1 · Slice 1.1** of the roadmap (see `internal-tools_modularization-roadmap.pdf`).

## Ongoing modularization

The codebase is being reorganized into a module-per-domain layout. Progress:

| Module | Status |
|---|---|
| `core/` — users, auth, roles, per-user OAuth, audit, app-settings | Phase 1 (in progress) |
| `seo/` — keywords, positions, competitors, backlinks, content, cannibalization, indexing, GSC insights | Phase 2 |
| `clients/` — client CRUD, packages, onboarding, contacts, credentials, service areas | Phase 2 |
| `reports/` — report editor, PDF/Word/share | Phase 2 |
| `tasks/` — task list, templates, subtasks | Phase 2 |
| `integrations/` — OAuth flows + per-provider services | Phase 2 |
| `comms/` — Gmail send + AI writers + Email Studio | Phase 3 |
| `sales/` — Pipeline, Proposals, Follow-ups, Reactivation, Questionnaires | Phase 4 |
| `ops/` — Site Health, Delivery Risk, Client Health, Hosting, Credentials Watchdog | Phase 5 |
| Other (`ppc/`, `revenue/`, `pulse/`, `ai/`, `portal/`) | Phase 6+ |

## Handy commands

```bash
# Container logs
docker compose logs -f api
docker compose logs -f web

# Reset DB (WARNING — wipes everything and re-seeds)
docker compose down -v

# Mongo shell
docker compose exec mongo mongosh internal-tools
```
