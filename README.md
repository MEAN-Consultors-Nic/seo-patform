# SEO Platform — Media Spearhead

Plataforma para gestionar los clientes SEO de Media Spearhead: clientes por tier, tareas por ciclo quincenal, reportes con PIN-protected share links y notificaciones por email.

## Stack

- **Monorepo:** Nx 22 (pnpm)
- **Backend:** NestJS 11 (TypeScript)
- **Frontend:** Angular 21 (standalone components, signals, Tailwind CSS)
- **Base de datos:** MongoDB 7
- **Email:** nodemailer + SMTP
- **PDF:** pdfmake
- **Tipos compartidos:** `libs/shared` (importable como `@seo/shared`)

```
seo-platform/
├── apps/
│   ├── api/         NestJS backend
│   └── web/         Angular frontend
├── libs/
│   └── shared/      Tipos compartidos
├── docker/          Dockerfiles + nginx
├── docker-compose.yml
├── Procfile         Heroku
├── vercel.json      Vercel
└── .env.example
```

## Quickstart (local con Docker)

```bash
cp .env.example .env
# Edita .env y completa SMTP_USER, SMTP_PASS, etc.
docker compose up -d --build
```

- API: http://localhost:3000/api
- Web: http://localhost:4200
- Mongo Express: http://localhost:8081

## Scripts (pnpm)

```bash
pnpm dev          # API + Web en paralelo (sin Docker)
pnpm dev:api      # solo API
pnpm dev:web      # solo Web
pnpm db:up        # solo Mongo + mongo-express en Docker
pnpm db:down      # apaga Mongo
pnpm build        # build API + Web
pnpm build:api    # solo API
pnpm build:web    # solo Web
pnpm start        # node dist/apps/api/main.js (production)
pnpm lint         # lint todos los proyectos
pnpm typecheck    # type-check todos los proyectos
```

## Deployment

### Backend → Heroku

```bash
# Una vez por proyecto
heroku create seo-platform-api --buildpack heroku/nodejs

# Variables de entorno (mínimo)
heroku config:set \
  NODE_ENV=production \
  MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER/seo-platform" \
  JWT_SECRET="$(openssl rand -base64 32)" \
  PUBLIC_WEB_URL="https://your-app.vercel.app" \
  CORS_ORIGINS="https://your-app.vercel.app,/.*\\.vercel\\.app$/" \
  SMTP_HOST=mail.mediaspearhead.com \
  SMTP_PORT=587 \
  SMTP_SECURE=false \
  SMTP_USER=seo@notifications.mediaspearhead.com \
  SMTP_PASS='YOUR_PASSWORD_HERE' \
  SMTP_FROM_NAME="Media Spearhead - SEO Platform" \
  SMTP_FROM_EMAIL=seo@notifications.mediaspearhead.com

# Deploy
git push heroku main
```

Heroku detecta `pnpm` por el campo `packageManager` en `package.json` y corre:
1. `pnpm install --frozen-lockfile`
2. `pnpm heroku-postbuild` → ejecuta `pnpm build:api` → produce `dist/apps/api`
3. `pnpm start` → `node dist/apps/api/main.js` (lee `process.env.PORT`)

### Frontend → Vercel

1. **Editar `apps/web/src/environments/environment.prod.ts`** y ajustar `apiBase` con la URL real de Heroku, por ej:
   ```ts
   apiBase: 'https://seo-platform-api.herokuapp.com/api'
   ```
2. Conectar el repo en https://vercel.com/new — Vercel lee `vercel.json`:
   - Install: `pnpm install --frozen-lockfile`
   - Build: `pnpm exec nx build web --configuration=production`
   - Output: `dist/apps/web/browser`
3. Las rutas SPA (`/r/:token`, `/clients/:id`, etc.) se redirigen a `index.html` vía `rewrites` en `vercel.json`.

### Base de datos → MongoDB Atlas

1. Crea cluster M0 gratuito en https://cloud.mongodb.com
2. Whitelist `0.0.0.0/0` o las IPs de Heroku
3. Crea un usuario de DB y copia la connection string a `MONGODB_URI`

## Variables de entorno

Ver `.env.example`. Las clave en producción:

| Var | Descripción |
|---|---|
| `MONGODB_URI` | Connection string Atlas |
| `JWT_SECRET` | Secreto firma JWT (auth + PDF unlock token) |
| `PUBLIC_WEB_URL` | URL del frontend (usado en emails para construir share link) |
| `CORS_ORIGINS` | Comma-sep. de orígenes permitidos; admite regex con `/.../`  |
| `SMTP_*` | Credenciales del servidor SMTP |

## Datos iniciales

Al arrancar el API por primera vez, `SeedService` inserta los 11 clientes con sus tiers y `AuthService` crea el usuario root: `joseph.o@mediaspearhead.com` / `spearhead2026` (cámbialo con `POST /api/users/:id/reset-password` después).

## Roles

- **root** — control total + gestión de usuarios (página `/users`)
- **seo-manager** — ve/edita todos los clientes; no gestiona usuarios
- **seo-strategist** — solo ve/edita los clientes donde es `ownerId`

## Comandos útiles

```bash
# Logs containerizados
docker compose logs -f api
docker compose logs -f web

# Reset DB (CUIDADO — borra todo y reseedea)
docker compose down -v

# Mongo shell
docker compose exec mongo mongosh seo-platform
```
