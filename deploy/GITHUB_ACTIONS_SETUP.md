# Sentinel GitHub Actions setup

The workflow in `.github/workflows/deploy.yml` validates every push to `main`.
It deploys only when the repository variable `DEPLOY_ENABLED` is set to `true`.
This prevents an unfinished infrastructure setup from receiving an accidental deployment.

## 1. One-time VPS preparation

Create the Sentinel directory and its persistent state:

```bash
mkdir -p /opt/sentinel/backend /opt/sentinel/data
```

Create `/opt/sentinel/backend/.env` containing the Gemini key. This file is never committed and is preserved by the deployment workflow:

```env
GEMINI_API_KEY=replace_with_the_production_key
```

Create an SSH deploy key with access to the VPS. Add its public key to the VPS user's `authorized_keys`; save its private key as the GitHub Actions secret below.

## 2. GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add these repository secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP address or hostname |
| `VPS_USER` | VPS deployment user |
| `VPS_PORT` | `22` unless SSH uses another port |
| `VPS_SSH_KEY` | private key for the deployment user |

Add the repository variable `DEPLOY_ENABLED` with the value `true` only after the preceding secrets, VPS setup, DNS, Nginx and TLS are ready.

## 3. First backend release and Nginx

With `DEPLOY_ENABLED` still unset, run the backend one time from `/opt/sentinel` to verify the container. Then install the provided Nginx vhost from `deploy/nginx/sentinel-api.conf`, validate Nginx, and enable TLS after the API hostname resolves to the VPS.

## Continuous delivery

Thereafter, each push to `main` performs validation, releases the Docker backend to `/opt/sentinel`, and checks `/api/v1/health`.

## Netlify continuous deployment

Connect the GitHub repository directly to Netlify. Netlify then publishes `/frontend` automatically on each push using `netlify.toml`; no Netlify token or site ID is required in GitHub Actions.

In Netlify **Site configuration → Environment variables**, create:

| Variable | Value |
| --- | --- |
| `SENTINEL_API_BASE` | `https://api.sentinel.backnd-api.cloud/api/v1` |

The Netlify build writes this value into `frontend/runtime-config.js` before publishing.
