# Deploying Atmos X

Production runs at https://atmosx.baksho.app on the shared VPS (`root@93.127.172.118`, 2 cores,
8 GB, other sites on the same host). The `docker-compose.prod.yml` stack runs four services: `db`
(PostGIS), `api` (FastAPI; migrates and seeds on start), `worker` (jobs and schedule) and `web`
(Next.js). The host's nginx terminates TLS with a certbot certificate and proxies to `web`, which
rewrites `/api/v1` and `/media` to `api`.

| What | Where |
| --- | --- |
| Compose project | `/root/atmos-x` on the VPS (project name `atmos-x`) |
| Web port | `127.0.0.1:3160` → `web:3000` |
| Secrets | `/root/atmos-x/.env` (mode 600, never in git) |
| Database | `atmos-x_atmos-pg` volume |
| Rasters, IMERG files, photos, documents | `atmos-x_atmos-data` volume, mounted at `/data` |
| nginx site | `/etc/nginx/sites-available/atmosx` (source: `deploy/atmosx.baksho.app.nginx`) |
| V0 backup | `/root/atmos-x-v0` (source and `.env`) and the `atmos-x-web:v0` image |

Each service has a CPU and memory cap (`DB_CPUS`, `API_MEM`, `WORKER_CPUS`, …; defaults are in
the compose file), so a cold region scan can't starve the other sites.

## Environment

`deploy/make-prod-env.py` writes the production `.env` from the development one: it keeps the
third-party keys, drops OpenAI and compose-managed values, and sets `APP_ENV=production`,
`COOKIE_SECURE=true`, the public origin, `SMS_PROVIDER=twilio` (phone sign-in stays off without
Twilio keys) and `SSLCOMMERZ_SANDBOX=true`. It generates `JWT_SECRET` and `POSTGRES_PASSWORD` once;
pass the server's current `.env` as the third argument to keep them.

```sh
scp root@93.127.172.118:/root/atmos-x/.env /tmp/prod.current.env
python3 deploy/make-prod-env.py .env /tmp/prod.env /tmp/prod.current.env
scp /tmp/prod.env root@93.127.172.118:/root/atmos-x/.env && rm /tmp/prod.env /tmp/prod.current.env
```

`NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a web rebuild.

## Ship a new version

From a clean checkout of the commit to deploy. Unpack into an empty directory: extracting over the
old tree would keep files that git has since deleted.

```sh
SHA=$(git rev-parse --short HEAD)
ssh root@93.127.172.118 "rm -rf /root/atmos-x-next && mkdir /root/atmos-x-next"
git archive HEAD | ssh root@93.127.172.118 'tar -x -C /root/atmos-x-next'
ssh root@93.127.172.118 "cd /root/atmos-x-next && cp -p /root/atmos-x/.env . && \
  docker compose -p atmos-x -f docker-compose.prod.yml build api worker && \
  ATMOS_BUILD_ID=$SHA docker compose -p atmos-x -f docker-compose.prod.yml build web"
ssh root@93.127.172.118 "rm -rf /root/atmos-x-prev && mv /root/atmos-x /root/atmos-x-prev && \
  mv /root/atmos-x-next /root/atmos-x && cd /root/atmos-x && \
  docker compose -f docker-compose.prod.yml up -d"
```

Build one image at a time: the VPS also serves other production sites. Passing the git hash as
`ATMOS_BUILD_ID` makes each deploy install a fresh service worker.

## Check it

```sh
ssh root@93.127.172.118 'cd /root/atmos-x && docker compose -f docker-compose.prod.yml ps && \
  docker compose -f docker-compose.prod.yml logs --tail=50 api worker web'
curl -s https://atmosx.baksho.app/api/v1/health
```

First admin: `docker compose -f docker-compose.prod.yml exec api python -m app.scripts.make_admin you@example.org`
(the person signs in once first). One-time static files (DB-IP, LIS/OTD, GPWv4):
`docker compose -f docker-compose.prod.yml exec worker python -m app.scripts.static_data`.

## Roll back to V0

```sh
ssh root@93.127.172.118 'cd /root/atmos-x && docker compose -f docker-compose.prod.yml down && \
  cd /root/atmos-x-v0 && docker tag atmos-x-web:v0 atmos-x-web:latest && docker compose -p atmos-x up -d --no-build'
```
