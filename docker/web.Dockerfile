FROM node:20-alpine AS base
WORKDIR /workspace
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
EXPOSE 4200
CMD ["pnpm", "exec", "nx", "serve", "web", "--host=0.0.0.0", "--port=4200"]

FROM deps AS build
COPY . .
RUN pnpm exec nx build web --configuration=production

FROM nginx:1.27-alpine AS production
COPY --from=build /workspace/dist/apps/web /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
