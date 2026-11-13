# url-shortener

A free, open-source URL shortener written in Go with PostgreSQL and a plain HTML/CSS/JavaScript frontend.
Shortening links needs no account, nothing is sent to third parties, and click analytics store no IP addresses.

## Features

- Shorten `http`/`https` URLs, optional custom alias, one-click copy
- Guest mode (random token in an HttpOnly cookie) or optional accounts (Argon2id, server-side sessions)
- Guest links move into your account when you register or log in from the same browser
- Dashboard with total links, total clicks and links clicked in the last 30 days
- My links: search, filter, sort, pagination, delete with confirmation
- Link details and analytics: clicks per day (7/30/90 days) with hover tooltips, top links, referrer hostnames
- Light, dark and system themes; responsive layouts; keyboard accessible; respects `prefers-reduced-motion`
- REST API described with OpenAPI 3
- Rate limiting, request-size limits, CSRF protection, Content-Security-Policy and other security headers


## Technology stack

| Layer | Choice |
|---|---|
| Backend | Go 1.22+, [chi](https://github.com/go-chi/chi), standard library |
| Database | PostgreSQL 13+ through [pgx v5](https://github.com/jackc/pgx); SQL migrations; parameterized queries |
| Passwords | Argon2id (`golang.org/x/crypto/argon2`) |
| Frontend | HTML, CSS, vanilla JavaScript (ES modules); no framework, no build step, no CDN |
| API docs | OpenAPI 3.0.3, optional Swagger UI |
| Local database | Docker Compose |

## Project structure

```
cmd/server/          entry point
internal/config/     environment configuration
internal/validate/   URL, alias, email and password validation
internal/shortcode/  random short-code generator
internal/auth/       Argon2id hashing and session tokens
internal/ratelimit/  in-memory rate limiter
internal/store/      all SQL: users, sessions, links, clicks, analytics, migrations
internal/server/     router, middleware and HTTP handlers
migrations/          SQL migrations, embedded in the binary
web/static/          frontend, embedded in the binary
docs/                openapi.yaml and screenshots
scripts/             check.sh, check-frontend.mjs, fetch-swagger-ui.sh
```

The API and frontend share one origin. Destination URLs are validated and stored, never fetched.
A link belongs to exactly one owner (a user or a guest session). Deleting a link erases its destination and clicks and keeps a tombstone so the short code is never reassigned; the short URL then answers `410 Gone`.

## Prerequisites

- Go 1.22 or newer
- Docker with Compose (or a local PostgreSQL 13+)
- Node.js 18+ for `scripts/check-frontend.mjs` (the app itself does not need Node)

## Installation

```bash
git clone <repository-url>
cd url-shortener
go mod tidy
```

`go mod tidy` writes `go.sum`. Commit `go.sum` with the project.

## Environment configuration

```bash
cp .env.example .env
```

Replace `change-me` with the same password in `POSTGRES_PASSWORD`, `DATABASE_URL` and `TEST_DATABASE_URL`. `.env` is git-ignored.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `ADDR` | `:8080` | Listen address |
| `BASE_URL` | `http://localhost:8080` | Public origin used to build short links; use `https://` in production |
| `COOKIE_SECURE` | true when `BASE_URL` is https | `Secure` flag on cookies |
| `TRUST_PROXY` | `false` | Take the client IP for rate limiting from `X-Forwarded-For`; enable only behind your own reverse proxy |
| `TEST_DATABASE_URL` | none | Database used by integration tests. Its name must end in `_test`, and its schema is dropped on every test |

## Docker Compose

`docker-compose.yml` starts PostgreSQL 16 only, bound to `127.0.0.1:5433` so it does not collide with a local PostgreSQL on 5432.

```bash
docker compose up -d db
docker compose exec db createdb -U urlshortener urlshortener_test
```

## Database migrations

Migrations in `migrations/` are applied automatically, in filename order and once each, when the server starts. Applied versions are recorded in `schema_migrations`.

## Running the application

```bash
make run
```

Open <http://localhost:8080>. `make build` produces a single binary at `bin/url-shortener`. Frontend files are embedded, so restart the server after editing `web/static`.

## Running tests

```bash
make check
```

This runs `gofmt`, `go vet`, the frontend check and `go test ./...`. Without `TEST_DATABASE_URL` the PostgreSQL integration tests are skipped and say so in the output. To include them:

```bash
set -a; . ./.env; set +a
go test ./... -count=1 -v
```

`node scripts/check-frontend.mjs` checks JavaScript syntax and rejects `innerHTML`, inline scripts and styles, and external resources.

## API documentation

The OpenAPI document is served at `/docs/openapi.yaml`. For the interactive Swagger UI at `/docs`, install it once (needs npm and network):

```bash
./scripts/fetch-swagger-ui.sh
```

| Method | Path | Purpose |
|---|---|---|
| GET, HEAD | `/{code}` | Redirect (302). HEAD is not counted as a click |
| POST | `/api/v1/links` | Create a link |
| GET | `/api/v1/links` | List own links (`q`, `filter`, `sort`, `limit`, `offset`) |
| GET, DELETE | `/api/v1/links/{id}` | Read or delete an own link |
| GET | `/api/v1/links/{id}/analytics?days=` | Per-link statistics |
| GET | `/api/v1/analytics/summary?days=` | Totals, daily series, top links, referrers |
| POST | `/api/v1/auth/register`, `/login`, `/logout` | Account lifecycle |
| GET | `/api/v1/auth/me` | Session state |
| PUT | `/api/v1/auth/password` | Change password; signs out other sessions |
| GET | `/healthz` | Liveness and database check |

## Security considerations

- Destinations must be `http` or `https`. Credentials in URLs, control characters, non-ASCII hosts and links back to this shortener are rejected. A database constraint and the redirect handler repeat the scheme check.
- Ownership comes only from the server-side session. The API accepts no owner id, and other people's links return `404`.
- Session and guest tokens are 256-bit random values; only their SHA-256 is stored. Cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` over https. Login rotates the session; logout deletes it; changing the password signs out other sessions.
- Passwords use Argon2id with a per-hash salt and constant-time comparison; unknown emails cost the same time as wrong passwords.
- State-changing requests require the `X-Requested-With` header and, if sent, a same-site `Origin`. No CORS headers are sent.
- The CSP allows scripts and styles from this origin only (the `/docs` page also allows inline styles for Swagger UI). User text is rendered with `textContent`.
- Limits: 8 KiB request bodies, 15 s request timeout, 5 s statement timeout, per-IP rate limits (IPv6 grouped by /64), 500 links per owner.
- Logs contain method, path, status and duration only; no IPs, cookies, bodies or stack traces reach clients.

Not covered: short links are not checked against malware or phishing lists, there is no per-account login lockout, registration reveals whether an email is already registered, and rate limits live in process memory (reset on restart, not shared between instances).

## Privacy

- Per click, the database stores the link id, a timestamp and the referrer hostname (path and query are discarded). No IP address, user agent or visitor id is stored, and nothing is sent to third parties.
- Click numbers are click counts, not unique visitors.
- Cookies: `us_guest` and `us_session`, both strictly necessary and HttpOnly. The browser also stores a `theme` preference if you choose one.
- Guest sessions last 180 days from last use. After that the guest's links and their clicks are deleted. Clearing cookies loses access to guest links.
- Deleting a link erases its destination and clicks immediately.

## Licenses

The project is MIT licensed ([LICENSE](LICENSE)). Dependency licenses are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Known limitations

- Rate limiting and sessions assume a single server instance.
- There is no undo for deleting a link, and there is no password reset (no email provider).
- A deleted link's code stays reserved.
- Links claimed from a guest session are not re-checked against the 500-link limit.
- Hosting is not free: a server, managed database or domain may cost money depending on the provider.
