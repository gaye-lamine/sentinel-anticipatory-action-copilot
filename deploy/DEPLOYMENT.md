# Sentinel deployment runbook

## VPS backend

The compose service is isolated from existing applications:

- Container name: `sentinel-backend`
- Container port: `8000`
- Host bind address and port: `127.0.0.1:8084`
- Persistent SQLite directory: `./data`

On the VPS, place the project in its own directory, ensure `backend/.env` contains `GEMINI_API_KEY`, then run:

```bash
docker compose up -d --build
curl http://127.0.0.1:8084/api/v1/health
```

## Nginx and TLS

After the DNS A record for `api.sentinel.backnd-api.cloud` points to the VPS, copy `deploy/nginx/sentinel-api.conf` to Nginx's enabled-sites directory, validate it, reload Nginx, then obtain a certificate with Certbot.

The Nginx vhost proxies only this hostname to `127.0.0.1:8084`; it does not change other sites or Docker port mappings.

## Netlify frontend

Deploy the repository to Netlify. `netlify.toml` publishes `/frontend` and writes `runtime-config.js` with:

```text
https://api.sentinel.backnd-api.cloud/api/v1
```

Set `SENTINEL_API_BASE` in Netlify's environment variables to the same HTTPS endpoint before deploying.
