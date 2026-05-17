<p align="center">
  <b style="font-size:32px">kore</b><br>
  <em>AI API Proxy</em>
</p>

<p align="center">
  A self-hosted AI API gateway / reverse proxy with provider failover, load balancing, usage quotas, and a modern web dashboard.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#manual-installation">Manual Install</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#api-compatibility">API Compatibility</a> •
  <a href="https://yorkian.notion.site/kore" target="_blank">中文</a>
</p>

---

## What is kore?

kore sits between your AI applications and API providers. Configure it once, and your downstream apps (OpenClaw, LobeChat, ChatGPT-Next-Web, etc.) never need to know when you switch providers, rotate keys, or add failover.

```
┌─────────────────────┐
│  Your AI App         │  ← Configure once: kore url + key
│  (OpenClaw, etc.)    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│       kore           │  ← Manages keys, failover, quotas
│  Gateway / Proxy     │
└──┬──────┬──────┬────┘
   │      │      │
   ▼      ▼      ▼
  OpenAI  Claude  DeepSeek   ← Real API providers
```

## Features

- **One Config, Switch Anytime** — Downstream apps configure kore's URL and key once. Switch providers, rotate keys, or add new ones entirely from kore's dashboard.

- **OpenAI-Compatible API** — Exposes standard `/v1/chat/completions` endpoint. Any app that supports custom OpenAI endpoints works out of the box.

- **SSE Streaming** — Full support for Server-Sent Events streaming, the standard for real-time AI chat.

- **Smart Failover** — Two scheduling modes:
  - **Priority** — Always uses the highest-priority provider. Falls back to the next on failure.
  - **Round Robin** — Distributes requests across providers in rotation.
  - Auto-detects failures (timeout, 5xx, stream interruption), moves providers to a fault pool, and runs periodic health checks to restore them.

- **Usage Quotas** — Set prompt and completion token limits on both providers and strategies. Providers enter "throttled" state when limits are reached.

- **Proxy Support** — Per-provider HTTP and SOCKS5 proxy configuration. Useful for accessing providers with geographic restrictions.

- **Dual Token Tracking** — Logs both provider-reported and locally-estimated token counts for every request.

- **GeoIP Logging** — Records client IP country for every request using ip-api.com with /24 IPv4 and /64 IPv6 prefix caching (7-day TTL).

- **Real-time Dashboard** — Token usage charts, request volume trends, provider health ranking, fault pool status, geographic distribution, and recent request feed.

- **Backup & Restore** — Export all providers and strategies as a JSON file. Import to quickly restore or migrate configurations across instances.

- **Secure** — API keys encrypted with AES-256-GCM in SQLite. Admin auth via JWT. kore generates its own independent keys (key0) for downstream apps.

## Quick Start

**One-click install** on Debian / Ubuntu:

```bash
curl -fsSL https://raw.githubusercontent.com/kore-01/api/main/install.sh | sudo bash
```

This will:
1. Install Node.js 20 (if needed) and PM2
2. Clone the repo to `/opt/kore`
3. Install dependencies and build
4. Generate encryption keys
5. Start the service on port `3060`

Then visit `http://your-server-ip:3060` to create your admin account.

## Manual Installation

```bash
# Prerequisites: Node.js 18+, npm, curl, git
git clone https://github.com/kore-01/api.git /opt/kore
cd /opt/kore

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Generate encryption keys
node setup-keys.js

# Build
npx tsc
cd frontend && npx vite build && cd ..

# Start
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### Updating

```bash
cd /opt/kore
pm2 stop kore
git pull
npm install
cd frontend && npm install && npx vite build && cd ..
npx tsc
pm2 restart kore
```

## Docker

[![Docker Hub](https://img.shields.io/docker/v/kore01/api?label=Docker%20Hub)](https://hub.docker.com/r/kore01/api)

### Pull from Docker Hub (Recommended)

```bash
docker run -d --name kore --restart unless-stopped -p 3060:3060 -v kore-data:/app/data kore01/api:latest
```
OR
```bash
mkdir kore && cd kore
curl -fsSL https://raw.githubusercontent.com/kore-01/api/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```
Encryption keys are auto-generated on first run and persisted in the data volume. Zero configuration needed.

### Build Locally

```bash
git clone https://github.com/kore-01/api.git && cd kore
docker compose -f docker-compose.build.yml up -d
```

### Manage

```bash
docker logs -f kore               # View logs
docker restart kore               # Restart
docker stop kore && docker rm kore        # Stop&Delate
docker pull kore01/api:latest && docker stop kore && docker rm kore && docker run -d --name kore --restart unless-stopped -p 3060:3060 -v kore-data:/app/data kore01/api:latest   # Update to latest
```
OR
```bash
docker compose up -d            # Start
docker compose logs -f kore           # View logs
docker compose down              Stop
docker compose pull && docker compose up -d              # Update to latest
```

Data and keys are persisted in Docker volume `kore-data`.

> **Note:** You can also provide your own keys via environment variables (`KORE_ENCRYPTION_KEY`, `JWT_SECRET`) if needed. Auto-generated keys are stored in `/app/data/.kore-keys.json` inside the volume.

## Configuration

### Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3060` | Server port |
| `HOST` | `0.0.0.0` | Listen address |
| `DB_PATH` | `./data/kore.db` | SQLite database path |
| `KORE_ENCRYPTION_KEY` | (auto-generated) | AES-256 key for encrypting stored API keys |
| `JWT_SECRET` | (auto-generated) | JWT signing secret |
| `IPINFO_TOKEN` | (optional) | ipinfo.io token (fallback GeoIP source) |
| `FIRST_TOKEN_TIMEOUT` | `15000` | Streaming first-token timeout (ms) |
| `NON_STREAM_TIMEOUT` | `30000` | Non-streaming request timeout (ms) |
| `HEALTH_CHECK_INTERVAL` | `60000` | Fault pool health check interval (ms) |
| `GEO_CACHE_TTL` | `604800000` | GeoIP cache TTL (ms, default 7 days) |

> ⚠️ **Important:** `KORE_ENCRYPTION_KEY` is generated on first run. Do not change it after storing API keys, or they will become undecryptable. Back up your `.env` file.

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 443 ssl;
    server_name kore.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3060;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;           # Required for SSE streaming
        proxy_cache off;
    }
}
```

## How It Works

### Request Flow

1. Client sends request to kore's `/v1/chat/completions` with Bearer key0
2. kore validates key0 → finds the linked strategy
3. Strategy-level quota check
4. Scheduler selects a provider (priority or round-robin, skipping fault/throttled)
5. Provider-level quota check
6. Request body's `model` field is **overridden** with the provider's configured model
7. Request is forwarded through the provider's proxy (if configured)
8. Response is streamed back to the client
9. Token usage logged (both provider-reported and locally-estimated)
10. Client IP country resolved asynchronously via GeoIP

### Failover Strategy

- **Before first token arrives** (within timeout): Abort and try next provider
- **After streaming has started**: Continue current stream, mark provider as "unstable" for future requests
- Faulted providers are health-checked every 60 seconds with a lightweight `"hi"` request

### Provider States

| State | Meaning | Entry | Exit |
|-------|---------|-------|------|
| **Normal** | Available for routing | Health check passes / initial | — |
| **Fault** | Temporarily unavailable | Timeout, 5xx, stream break | Health check succeeds |
| **Throttled** | Quota exceeded | Token limit reached | Admin resets usage or raises limit |

## API Compatibility

kore exposes OpenAI-compatible endpoints:

```
POST /v1/chat/completions    ← Main endpoint (streaming & non-streaming)
POST /v1/completions         ← Text completions
GET  /v1/models              ← Lists available models
```

### Management API (Dashboard Auth Required)

```
GET  /api/backup    ← Export all providers and strategies as JSON
POST /api/backup    ← Import from JSON backup file
```

### Usage in Downstream Apps

After creating a strategy, kore generates a key (e.g., `kore-a1b2c3d4...`). Use it like an OpenAI key:

**OpenClaw / Clawd:**
```json
{
  "baseUrl": "https://your-server:3060/v1",
  "apiKey": "kore-a1b2c3d4...",
  "api": "openai-completions"
}
```

**LobeChat:** Settings → Language Model → OpenAI → set API URL and key.

**cURL:**
```bash
curl https://your-server:3060/v1/chat/completions \
  -H "Authorization: Bearer kore-a1b2c3d4..." \
  -H "Content-Type: application/json" \
  -d '{"model":"kore","messages":[{"role":"user","content":"hello"}]}'
```

> Note: The `model` parameter can be anything — kore overrides it with the provider's configured model.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 + TypeScript + Fastify 4 |
| Frontend | Vue 3 + Vite + Tailwind CSS + Chart.js |
| Database | SQLite (sql.js / better-sqlite3) |
| Process Manager | PM2 |

## Project Structure

```
kore/
├── src/                    # Backend TypeScript source
│   ├── index.ts            # Fastify server entry
│   ├── config.ts           # Environment configuration
│   ├── db/                 # Database connection + encryption
│   ├── middleware/          # JWT auth + proxy auth
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   └── utils/              # Helpers (key gen, IP utils, proxy fetch, SSE)
├── frontend/               # Vue 3 SPA
│   └── src/
│       ├── stores/         # API client + i18n
│       └── views/          # Dashboard, Providers, Strategies, Logs, Settings
├── setup-keys.js           # Encryption key generator
├── install.sh              # One-click install script
├── ecosystem.config.js     # PM2 configuration
└── .env.example            # Environment template
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/kore-01/api/main/uninstall.sh | sudo bash
```

Or manually:

```bash
pm2 delete kore && pm2 save
rm -rf /opt/kore
```

## Buy Me a Coffee（USDT）

| Network       | Address                                                                 |
|------------|----------------------------------------------------------------------|
| BNB(BEP20) | `0x6104ff99c18405c4f3fc6bfd16adc7ff7f5b1e89`                          |
| TRC20      | `TMwgiHHXmPrAMFNqa3eMvZpntsnKYuw7yp`                                  |
| Aptos      | `0x4323ed79c686015848a883392ed3cbc5fe7239819933546abab8cacf9ab77f46`  |

## License

MIT


## Disclaimer

The producer has tried their best to ensure the quality of the project, however, in actual use, users need to bear the risks and losses caused by issues inherent in the software itself such as security and stability, as well as the legality of the data used. Please fully test before going live in a production environment.

---

<p align="center">
  <a href="https://github.com/kore-01/api">GitHub</a>
</p>
