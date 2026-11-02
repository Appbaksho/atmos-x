# Deploying Atmos X

Production runs at https://atmosx.baksho.app as one Docker container on the VPS, behind the host's
nginx, which terminates TLS with a certbot certificate.

| What | Where |
| --- | --- |
| Compose project | `/root/atmos-x` on the VPS |
| Container port | `127.0.0.1:3160` to `3000` |
| Secrets and build values | `/root/atmos-x/.env` (mode 600, not in git) |
| API response cache | `atmos-cache` Docker volume, mounted at `/data` |
| nginx site | `/etc/nginx/sites-available/atmosx` (source: `deploy/atmosx.baksho.app.nginx`) |

## Environment

`.env` needs the runtime values from `apps/web/.env.example`, plus these values for production:

```
NEXT_PUBLIC_APP_URL=https://atmosx.baksho.app
OSM_USER_AGENT="AtmosX/0.1 (+https://atmosx.baksho.app)"
```

`NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a rebuild.

## Ship a new version

From a clean checkout of the commit to deploy:

```sh
git archive HEAD | ssh root@93.127.172.118 'tar -x -C /root/atmos-x'
ssh root@93.127.172.118 'cd /root/atmos-x && \
  ATMOS_BUILD_ID='"$(git rev-parse --short HEAD)"' docker compose up -d --build'
```

Passing the git hash as `ATMOS_BUILD_ID` makes each deploy install a fresh service worker. The build
runs on the VPS, which also hosts other production sites, so keep an eye on its memory while it runs.

## Check it

```sh
ssh root@93.127.172.118 'cd /root/atmos-x && docker compose ps && docker compose logs --tail=50 web'
curl -I https://atmosx.baksho.app
```
