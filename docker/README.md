# Docker · seo-platform

## Levantar todo (primera vez)

```bash
cp .env.example .env
# edita .env si vas a probar SMTP localmente
docker compose up --build
```

Servicios disponibles:
- API NestJS → http://localhost:3000/api
- Web Angular → http://localhost:4200
- MongoDB → mongodb://localhost:27017
- Mongo Express (UI de la DB) → http://localhost:8081

## Comandos útiles

```bash
docker compose up                     # arrancar (después del primer build)
docker compose up -d                  # arrancar en background
docker compose logs -f api            # logs del backend
docker compose logs -f web            # logs del frontend
docker compose down                   # parar y borrar containers
docker compose down -v                # parar y BORRAR la DB (cuidado)
docker compose exec api sh            # shell dentro del api
docker compose exec mongo mongosh     # shell de mongo
```

## Estructura

- `docker-compose.yml` — orquesta mongo, mongo-express, api, web
- `docker/api.Dockerfile` — imagen multistage para el NestJS (dev + prod)
- `docker/web.Dockerfile` — imagen multistage para Angular (dev con nx serve, prod con nginx)
- `docker/nginx.conf` — config de nginx para la imagen de producción del web
- `.env.example` — variables de entorno; copiar a `.env`
