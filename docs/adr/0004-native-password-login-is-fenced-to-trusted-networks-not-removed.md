# Native shared-password login is fenced to trusted networks, not removed

Tegata sits on the reverse proxy without Authelia's forward-auth — it does its own auth — so `/login` was the one no-2FA door into the very file every other service's 2FA depends on. One shared password (`TEGATA_ADMIN_PASSWORD_HASH`), no second factor, a 24h `admin` JWT, reachable from wherever the proxy is reachable. OIDC/SSO login has carried the everyday path since ADR-0003, so native login's only remaining job is recovery when Authelia itself is down. We fenced it rather than removing it: `POST /api/auth/login` is accepted only from a trusted source network, and refused everywhere else before the password is looked at.

The fence is the source address and nothing else. The trusted networks are the IPv4 CIDRs `NATIVE_LOGIN_CIDRS` names, by default `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` and loopback — the private ranges a self-hosted Authelia's own LAN rules usually name. An IPv4-mapped IPv6 address is read as the IPv4 address it carries, `::1` is always admitted, and every other address, every other IPv6 address included, is refused. The address is `req.ip` under the one trusted proxy hop `main.ts` already sets; no header is parsed by hand. The rule itself is a pure function in `src/auth/trusted-network.ts`, so it can be read and tested without a request; `NativeLoginFence` reads the list once at boot and refuses to boot on an entry it cannot parse, so a typo cannot silently widen or narrow the fence.

## Considered Options

- **Remove native login outright**: the smallest attack surface, and the one option that leaves no shared password at all. Rejected because it makes Authelia a hard single point of failure for its own recovery — with Authelia down, the only way to repair the users database it reads would be a shell on the host, and the whole point of Tegata owning that file is that repairing it does not need one.
- **A `TEGATA_BREAK_GLASS` on/off flag** (default off, flipped when needed): an explicit, auditable switch. Rejected because flipping it is a redeploy, and a redeploy is exactly what you cannot count on in the situation the path exists for. A door you have to deploy to open is not a break-glass door.
- **Both the flag and the fence**: the flag's cost with none of its benefit — the fence alone already refuses every caller the flag would have.
- **An address fence alone** (chosen): works with no redeploy and narrows the door to the machines that can already reach the LAN. The source address is not an authentication factor — it is a reachability precondition in front of one, and the shared password is still what authenticates. The list is configurable so a deployment whose trusted network is not RFC1918 (a tailnet's `100.64.0.0/10`, a single jump host) can name it, but the default is the fence as first built.

## Consequences

- A refusal happens before `argon2.verify` runs, so the endpoint tells an outside caller nothing about the password and costs nothing to refuse. The outside caller gets a 403 and a warn log line naming the source address. The existing 5-per-minute throttle is unchanged.
- A *successful* native login is a warn-level event naming the source address, and increments `tegata_native_login_total` on the registry `/metrics` already serves. Every success is meant to be rare; a steady count is a signal that something is wrong with SSO, or with who has the password.
- The login card asks `GET /api/auth/methods` which doors it may show, rather than guessing from its own address. SSO is the primary action for everyone; a client inside the fence also gets the password form, labelled as the break-glass path; a client outside gets a line saying password login works only from a trusted network. The card fails closed — if the backend can't be asked, the form stays hidden rather than 403ing on submit.
- Anyone on a trusted network can still reach the password prompt. The fence narrows who may try, not who may succeed, and a hostile device on the LAN is explicitly out of this threat model.
- A sibling container is inside the default fence too. ADR-0003 already records that containers on a shared compose network can hit `tegata:3000` directly; such a request skips the proxy, so `req.ip` falls back to the socket address — a docker-bridge `172.17–172.31.x`, which `172.16.0.0/12` admits. That is the same trust boundary ADR-0003 settled rather than a new one, and the point of this change is the open internet, which that path is not. A deployment that wants to exclude the bridge can name a narrower list.
- A VPN that hands clients a private address puts them inside the fence. That is intended: a WireGuard client on `10.x` is on the home network by every other definition.
- Tegata's Enabled-Count Guard used to lean on "native shared-password login always stays available" as the reason emptying a Guarded Group could never lock everyone out. That is no longer unconditionally true — it holds only from a trusted network — and `CONTEXT.md` says so.
- `AuthModule` imports `MetricsModule` for the counter. OIDC login, the cookie, the JWT and `AuthGuard` are untouched.

## Runbook — Authelia is down

1. Get on a trusted network. A machine on the LAN, or a VPN client holding an address the list admits; mobile data will be refused.
2. Open `https://<tegata host>/login`. The card shows the break-glass password form; if it doesn't, you are not inside the fence — fix that first rather than guessing at the password.
3. Unlock with the plaintext of `TEGATA_ADMIN_PASSWORD_HASH`. Keep that plaintext in your password manager, not next to the hash: the hash cannot recover it. The session is a normal 24h `admin` session.
4. Repair the Authelia Users Database through the UI as usual. Authelia watches the file and reloads it as soon as Tegata swaps it in, so the fix lands the moment Authelia is back up — and lands immediately if it is up but merely misconfigured.
5. If the login card itself will not load, Tegata is down too and this path is not the one you want; that is a container problem, not an auth problem.
6. Afterwards, check `tegata_native_login_total` moved by exactly the number of times you logged in. Anything more is worth chasing.
