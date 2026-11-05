# Tegata (手形)

> *Tegata* — handprint, a personal mark. User, group and invite management for
> [Authelia](https://www.authelia.com/)'s file user backend.

Authelia's file backend is a YAML file you edit by hand, with argon2 hashes you generate on
the command line. Tegata is the admin UI for it: it writes `users_database.yml` for you,
keeps groups, invites, password-reset tokens and group bundles in its own SQLite file, hands
out self-registration links, and stays honest about a file it does not fully own — it hashes
the users file to notice edits made behind its back, parses Authelia's main configuration to
preview what each group is actually granted, and refuses the one write that would lock every
admin out of SSO.

## Trust model — read this first

- **Tegata does its own authentication.** Do not put it behind Authelia's forward-auth: it has
  to keep working when Authelia is down, because repairing Authelia's users file is what it is
  for. Run it behind your reverse proxy with TLS, and nothing else in front.
- **OIDC is the everyday door.** Anyone can log in with Authelia; members of
  `OIDC_REQUIRED_GROUP` get the admin UI, everyone else gets a self-service profile page
  (display name, email, password) and nothing more.
- **The password login is a break-glass path, not a second door.** One shared password, no
  second factor, a 24-hour admin session — so it is only answered from the source networks
  `NATIVE_LOGIN_CIDRS` names (default: the three private IPv4 ranges plus loopback) and
  refused everywhere else before the password is even looked at. The login page asks the
  backend which doors to show, so a caller outside the fence never sees the form. A VPN
  client that gets a private address is inside the fence on purpose. The fence is a
  reachability precondition, not an authentication factor; the password is still what
  authenticates, so pick a long one.
- **The container runs as root.** Authelia keeps `users_database.yml` root-owned and `0600`,
  and Tegata is its writer. The example compose file drops every capability, forbids
  privilege escalation and mounts the root filesystem read-only instead.
- **Tegata never writes Authelia's main configuration.** It reads `configuration.yml` for
  the Access Preview and nothing else.

## 🤖 AI Disclaimer

> **Heads up!** Tegata is developed with heavy use of AI coding tools. Issues and pull
> requests may be triaged, commented on, or authored by an AI agent, with a human maintainer
> reviewing before anything is merged. AI-assisted contributions are welcome too; see the
> [AI policy](CONTRIBUTING.md#ai-policy) for the ground rules.

## Features

- **Users** — create, edit, delete, disable and re-enable, reset passwords (argon2id). Every
  change round-trips through `users_database.yml` with an atomic swap, so Authelia's file
  watcher never sees a half-written file.
- **Groups** — created in the UI or seeded at startup from whatever groups existing users
  already carry, so the Groups page can never be missing one in use. Deleting a group strips
  it from every user, invite and bundle that still names it, after a confirmation.
- **Group bundles** — named sets of groups ("Family member") that expand into a plain group
  list when you create an invite or a user. No live link afterwards.
- **Invites** — expiring, single-use self-registration links (7 days by default), optionally
  pre-filled and optionally emailed. The recipient picks their own username and password.
- **Reset tokens** — a 1-day link that lets one existing user set a new password, for when
  they have forgotten it. One outstanding token per user.
- **Email delivery** — invite and reset links go out over SMTP when configured, best-effort
  and never blocking the create; the copy-link and QR-code paths are always there.
- **Out-of-band edit detection** — the users file is hashed after every write; an edit by
  anything else shows a banner until an admin accepts the new baseline. It never blocks.
- **Access Preview** — a read-only, per-group summary of what Authelia's `configuration.yml`
  grants (the `{group}` domain placeholder, `group:` subject rules, OIDC authorization
  policies), plus config-level notes such as an authorization policy no client references.
- **Enabled-Count Guard** — a delete, disable or group change that would leave fewer than two
  enabled users, or empty a guarded group of its last enabled member, is refused until
  confirmed.
- **Observability** — Prometheus metrics on `/metrics` (HTTP latency and size histograms,
  plus `tegata_native_login_total`, which should stay flat), a runtime log-level endpoint,
  and `/api/health`.

## Running it

The image is `ghcr.io/phyberapex/tegata`, built for `linux/amd64` and `linux/arm64`. Pin a
version tag; `:next` tracks `main`.

```yaml
services:
  tegata:
    image: ghcr.io/phyberapex/tegata:1.0.0
    env_file: .env
    environment:
      - NODE_ENV=production
      - TEGATA_DB_PATH=/data/tegata.db
      - AUTHELIA_USERS_FILE=/authelia-config/users_database.yml
      - AUTHELIA_CONFIG_FILE=/authelia-config/configuration.yml
    volumes:
      - tegata-data:/data
      - ./authelia/config:/authelia-config
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    restart: unless-stopped
```

[`docker-compose.yml`](docker-compose.yml) is the full example with Traefik labels;
[`.env.example`](.env.example) lists every variable with a comment. The two volumes are the
whole integration: Tegata needs read-write access to the directory Authelia mounts its
configuration from, and a place for its own SQLite file.

Generate the admin password hash with Authelia itself:

```sh
docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'yourpassword'
```

In a compose `environment:` list every `$` in the hash has to be doubled (`$$argon2id$$…`);
in an `env_file` it is taken literally.

### Authelia configuration

Tegata is an OIDC client of Authelia. The policy admits every authenticated user — Tegata
decides admin versus self-service by group membership itself:

```yaml
identity_providers:
  oidc:
    authorization_policies:
      tegata:
        # or two_factor
        default_policy: one_factor
    clients:
      - client_id: tegata
        client_name: Tegata
        # authelia crypto hash generate pbkdf2 --variant sha512
        client_secret: $pbkdf2-sha512$...
        public: false
        authorization_policy: tegata
        require_pkce: true
        pkce_challenge_method: S256
        redirect_uris:
          - https://tegata.example.com/api/auth/oidc/callback
        scopes: [openid, email, profile, groups]
        userinfo_signed_response_alg: none
        token_endpoint_auth_method: client_secret_post
```

Authelia must be watching the users file (`authentication_backend.file.watch: true`) so
Tegata's writes take effect without a restart. Put `tegata` in
`ACCESS_PREVIEW_OPEN_POLICIES` so the Access Preview does not keep noting that the policy is
open — it is open on purpose.

### Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `TEGATA_ADMIN_PASSWORD_HASH` | yes | — | argon2id hash of the break-glass password |
| `TEGATA_JWT_SECRET` | yes | — | signs the session cookie; `openssl rand -hex 32` |
| `OIDC_ISSUER` | for SSO | — | Authelia's URL, e.g. `https://auth.example.com` |
| `OIDC_CLIENT_ID` | for SSO | — | the client id from Authelia's config |
| `OIDC_CLIENT_SECRET` | for SSO | — | the client secret's plaintext |
| `OIDC_REDIRECT_URI` | for SSO | — | `https://<tegata host>/api/auth/oidc/callback` |
| `OIDC_REQUIRED_GROUP` | no | `tegata` | the Authelia group that gets an admin session; always a guarded group |
| `AUTHELIA_USERS_FILE` | no | `/authelia-config/users_database.yml` | the file Tegata writes |
| `AUTHELIA_CONFIG_FILE` | no | `/authelia-config/configuration.yml` | the file the Access Preview reads |
| `TEGATA_DB_PATH` | no | `/data/tegata.db` | SQLite file for groups, invites, tokens, bundles, the baseline hash |
| `GUARDED_GROUPS` | no | — | comma-separated groups the Enabled-Count Guard also refuses to empty, e.g. `admins` |
| `ACCESS_PREVIEW_OPEN_POLICIES` | no | — | comma-separated OIDC authorization policies left open on purpose |
| `PORT` | no | `3000` | TCP port the backend listens on; a non-numeric or out-of-range value refuses to boot |
| `HOST` | no | `0.0.0.0` | address the backend binds to |
| `NATIVE_LOGIN_CIDRS` | no | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8` | IPv4 networks the password login answers from; a malformed entry refuses to boot |
| `PUBLIC_URL` | for email | `http://localhost:5173` | what the links in outgoing emails start with |
| `SMTP_HOST` | for email | — | unset disables email delivery entirely |
| `SMTP_PORT` | no | `587` | |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | no | — | both or neither |
| `SMTP_SENDER` | no | `Tegata <noreply@example.com>` | the From header |
| `SITE_NAME` | no | `Tegata` | the name shown in invite and reset emails, the login, register and reset pages, and the browser tab |
| `TRUST_PROXY` | no | `1` | the hops between the client and Tegata: a count (`2`), IPs/CIDRs (`10.0.0.0/8,172.16.0.0/12`) or `loopback`/`linklocal`/`uniquelocal`; an empty or unparseable value refuses to boot |
| `NODE_ENV` | no | — | `production` sets the `Secure` flag on cookies; set it |

By default Tegata trusts exactly one proxy hop for `X-Forwarded-For`, so `req.ip` under your
reverse proxy is the client's address — which is what the login fence judges. With no proxy in
front it is the socket address. Behind more than one hop (Cloudflare, or Nginx Proxy Manager plus
Tailscale), set `TRUST_PROXY` to the hop count or to the addresses of your proxies. A wrong value
changes who the fence admits: too low and `req.ip` is an inner proxy, which may sit on a private
address and let everyone in; too high lets a caller spoof their address with their own
`X-Forwarded-For`. With no proxy in front, set `TRUST_PROXY=0`.

## Development

```sh
pnpm install
pnpm dev          # backend on :3000, frontend with HMR on :5173, shared package in watch
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm boot-check   # boots backend/dist/main.js and probes /api/health, like CI and the image do
```

`pnpm dev` needs the two required variables and a users file to point at; a `.env` in
`backend/` is read. `docker-compose.dev.yml` builds the image and runs it on `:3100` against a
gitignored `dev-authelia-config/` directory instead.

### Layout

```
backend/   NestJS API, serves the built frontend; owns the users file and the SQLite store
frontend/  Vue 3 + Vite admin UI, plus the public invite and reset pages
shared/    @tegata/shared — the wire types both sides import
docs/adr/  decision records
```

`backend/CONTEXT.md` and `frontend/CONTEXT.md` define the vocabulary the code uses: Authelia
Users Database, Enabled-Count Guard, Break-Glass Fence, Out-of-Band Edit, Group Seeding,
Membership Projection and the rest. Read them before reading the code.

### The shared package

`shared/` is `@tegata/shared`, the one place a wire shape lives when both the backend and the
frontend need it — the access-preview response, the `Invite` row, the 409 a group delete
answers while something still names the group. Only a shape that crosses the wire unchanged
goes in; a type only one side reads stays in its module, and the package has no runtime
dependencies. Both sides depend on it with `workspace:*` and import its built `dist/`, so
after editing `shared/src/` run `pnpm build:shared` (every root script does so first, and
`pnpm dev` keeps a watch on it). The Dockerfile builds it before either side and `pnpm deploy`
copies its `dist/` into the backend's production tree.

## API

Every route except the public ones requires an admin session; the self-service routes accept
either role.

| Area | Routes |
|---|---|
| Auth | `GET /api/auth/methods`, `POST /api/auth/login` (fenced, 5/min), `POST /api/auth/logout`, `GET /api/auth/check`, `GET /api/auth/oidc/login`, `GET /api/auth/oidc/callback` |
| Users | `GET/POST /api/users`, `PATCH/DELETE /api/users/:username`, `POST /api/users/:username/reset-password` |
| Groups | `GET/POST /api/groups`, `PATCH/DELETE /api/groups/:name`, `GET /api/access-preview` |
| Bundles | `GET/POST /api/bundles`, `PATCH/DELETE /api/bundles/:name` |
| Invites | `GET/POST /api/invites`, `DELETE /api/invites/:id`, `POST /api/invites/:id/send`, public `GET /api/invites/:token/validate` and `POST /api/invites/:token/redeem` |
| Reset tokens | `GET/POST /api/reset-tokens`, `DELETE /api/reset-tokens/:id`, `POST /api/reset-tokens/:id/send`, public validate and redeem under `/api/reset-tokens/:token` |
| Self-service | `GET/PATCH /api/profile`, `POST /api/profile/password` |
| Integrity | `GET /api/users/database-integrity`, `POST /api/users/database-integrity/accept-baseline` |
| Infra | `GET /api/health`, `GET /api/status` (an unauthenticated summary for a dashboard widget), `GET /metrics`, `GET/POST /api/control/log-level` |

## License

MIT — see [LICENSE](LICENSE).
