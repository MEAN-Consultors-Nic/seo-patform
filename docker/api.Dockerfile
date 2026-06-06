FROM node:20-alpine AS base
WORKDIR /workspace
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# --- dependencies stage (cached) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# --- development stage ---
FROM deps AS development
COPY . .
EXPOSE 3000
CMD ["pnpm", "exec", "nx", "serve", "api", "--host=0.0.0.0"]

# --- build stage ---
FROM deps AS build
COPY . .
RUN pnpm exec nx build api --configuration=production

# --- production stage (slim) ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/api/dist ./
COPY --from=build /workspace/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "main.js"]
