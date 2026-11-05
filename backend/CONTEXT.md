# Tegata Backend

NestJS service managing Authelia SSO identities: users, groups, and invite-based self-registration, bridging a SQLite store for groups/invites with Authelia's own YAML user database.

## Language

**Authelia Users Database**:
The YAML file (`authelia-users.yml`) Authelia itself reads to authenticate users. Tegata is its sole writer — no other process edits it — and treats it as a database, not a config file: every user create/update/delete/password-reset round-trips through it. Authelia watches the file (`watch: true`) and reloads it whenever it changes, so writes take effect immediately; Tegata swaps the file in atomically so the watcher never observes a partial write.
_Avoid_: Users file, config file

**Disabled**:
A user attribute in the Authelia Users Database that blocks the user from authenticating through Authelia while leaving the account fully intact — groups, password, and any outstanding Reset Token all survive. Takes effect immediately on write (Authelia watches the file). Re-enabling removes the attribute entirely, so a re-enabled user is indistinguishable from one never disabled.
_Avoid_: Locked, lockout, banned, deactivated, suspended

**Enabled**:
A user without the Disabled attribute — able to authenticate through Authelia right now. The default state for every user; not a separate flag, just the absence of Disabled.
_Avoid_: Active (ambiguous with "recently logged in")

**Group Seeding**:
The startup sync (`UsersService.onModuleInit`) that scans every user in the Authelia Users Database, collects every group referenced by any user, and ensures each one exists in the SQLite `groups` table — so a group already in use can never be missing from the Groups UI even if it was never explicitly created there.
_Avoid_: Group sync, bootstrap

**Group Deletion**:
`DELETE /api/groups/:name` (`GroupDeletionService.deleteGroup`). Because membership lives on user records and Group Seeding brings back any group a user still names, deleting only the SQLite row would undo itself on the next boot — so the delete owns the whole reference set. While any user (Disabled ones included, since Group Seeding reads them all), pending Invite or Group Bundle still names the group, it refuses with a 409 in the Enabled-Count Guard's `confirmRequired` shape, listing `members`, `invites` and `bundles` plus the `emptiedGroups` the guard would report; a `confirm: true` retry strips the group from every one of them — the Authelia Users Database in one write behind the Enabled-Count Guard, then the invites, the bundles and the row in one SQLite transaction. A used or expired Invite grants nothing and keeps its `groups` as history. An Unreadable Users Database refuses the delete with a 503 rather than reading as "no members".
_Avoid_: Group removal (that is taking one user out of a group, an ordinary user update)

**Group Bundle**:
A named, admin-defined set of Group names (e.g. "Family member"), stored in SQLite as its own `bundles` table with a `groups` JSON-array TEXT column — the same encoding `invites.groups` already uses, chosen so bundles don't become the one place in the schema enforcing group-reference integrity that nothing else enforces. Picking a bundle on the Invite form or the user editor expands it into that entity's plain `groups` array at creation time; the groups then remain individually editable with no live link back to the bundle, so a Group Bundle never becomes a second membership source (see Membership Projection in the frontend CONTEXT.md). An Invite created from a bundle stores the bundle's name in a nullable `bundle_name` column, purely as a historical label with no FK — if the bundle is later renamed (not possible; bundle names are an immutable primary key like Group names) or deleted, the label is simply left stale rather than cleared or resolved live.
_Avoid_: Group template, group preset, saved group set, live bundle (there is no such thing — see Membership Projection)

**Invite**:
A token (7-day expiry by default) that grants the bearer permission to self-register, pre-assigned to one or more Groups. Lives in SQLite, independent of the Authelia Users Database until redeemed.

**Redemption**:
The act of exchanging a still-valid, not-yet-used Invite for a new Authelia user account — the invite is marked used (`used_by`/`used_at`) and can never be redeemed again, but it isn't deleted (unlike revocation). The mark is claimed *before* the account is written, so of two concurrent redemptions of one token only one gets past it; if the account write then fails (a taken username, an unreadable database) the mark is released and the invite stays redeemable. A Reset Token's redemption claims `used_at` the same way, except that a token whose user was deleted, or that a newer token superseded, while the password was being hashed is deleted rather than released.
_Avoid_: Registration, signup (those describe the user-facing action; redemption is what happens to the Invite)

**Revocation**:
Deleting an Invite or Reset Token outright before it's redeemed, so its token stops working. Distinct from a token simply expiring or being marked used.

**Reset Token**:
A short-lived token (1-day expiry by default) bound to one existing user, granting the bearer permission to set that user's password. Generated by an admin and either handed to the user out-of-band or delivered by Email Delivery to the address already on their Authelia Users Database record. At most one may be outstanding per user — generating a new one revokes the previous — and deleting the user removes their outstanding tokens. Single-use, like an Invite; unlike an Invite it operates on an existing account rather than creating one. Covers the case where a user has forgotten their password; a user who still knows their current password changes it themselves via self-service instead of going through an admin.
_Avoid_: Reset link (that's the URL carrying the token), password token

**Email Delivery**:
The optional, best-effort SMTP send of an Invite's or Reset Token's link — `MailService`, reusing the same relay Authelia's own notifier sends through. Requested via a `sendEmail` flag on create (fire-and-forget, so a slow or unreachable relay never delays or fails the create response); for an Invite it only fires when an `email` prefill is also set, for a Reset Token the address always comes from the bound user's Authelia Users Database record, never a client-supplied one — and when that record has no email, the create records `User has no email address to send to` as the row's `email_error` instead of skipping the send silently. Both Invites and Reset Tokens also expose an explicit per-row send/resend endpoint (`POST /api/invites/:id/send`, `POST /api/reset-tokens/:id/send`) an admin can trigger any time afterward on a still-pending one — first-send and resend are the same code path, not two. A Reset Token's resend resolves the recipient's address live from the Authelia Users Database at send time rather than reusing a value captured at creation, since the bound user's email may have changed since. The outcome lands on the row regardless of entry point — `email_sent_at` on success, `email_error` on failure — so a bounced or failed send is never silently invisible. The token is valid either way; the copy-link/QR path is the fallback of record, not a secondary option.
_Avoid_: Notification (Authelia's own SMTP notifier is a separate, unrelated system; a deployment typically points `SMTP_*` at the same relay)

**Access Preview**:
A read-only, per-group summary of what Authelia grants, plus config-level Config Notes: derived by parsing Authelia's main `configuration.yml` (mounted next to the Authelia Users Database) — the `{group}` domain-placeholder rule, `group:` subject rules, and OIDC authorization policies resolved to client display names. Convention-aware, not a full ACL interpreter: unmodeled group-referencing rules surface as unparsed notes. Unlike the users database (Tegata sole writer), the main configuration is a file Tegata must never write.
_Avoid_: ACL parser, permissions view

**Config Note**:
A config-level finding about Authelia's OIDC authorization policies — a policy shadowed by an unused same-named one, a policy no client references, a policy that's open by default, an open policy shared by more than one client, or an acknowledgment that's gone stale — that belongs to no group, is never merged into a `GroupAccessPreview`'s `notes`, and is rendered once at the top of the Groups page rather than inside any group's own Access panel. `ACCESS_PREVIEW_OPEN_POLICIES` is the deploy-time acknowledgment list for policies left open on purpose (e.g. `tegata`, ADR-0003); it is an environment variable rather than a setting in Tegata's own database on purpose, so opening a new policy in Authelia and silencing its note live in the same deployment config.
_Avoid_: warning, lint

**OIDC/SSO Login**:
The alternative to Tegata's own password login: any Authelia user authenticates against Authelia itself (PKCE authorization-code flow via `openid-client`), and Tegata trusts the resulting group claims instead of checking a local password. `authorization_policies.tegata` admits any authenticated Authelia user; `OIDC_REQUIRED_GROUP` membership is the sole admin/self decision point — present in the callback's groups grants Session Role `admin`, its absence grants `self`.

**Native Login**:
`POST /api/auth/login` — the one shared password (`TEGATA_ADMIN_PASSWORD_HASH`), no second factor, a 24h `admin` session. Since ADR-0003 made OIDC/SSO Login the everyday path, its only remaining job is recovery when Authelia itself is down, so it is kept but fenced rather than removed (ADR-0004): it is accepted only from inside the Break-Glass Fence. A success is a warn-level log line naming the source address and a tick of the `tegata_native_login_total` counter on the `/metrics` registry — rare by design, so a rising count is itself a signal.
_Avoid_: Admin login, local login, fallback login (it is the break-glass path, not a second everyday door)

**Break-Glass Fence**:
The source-address check in front of Native Login: `NativeLoginFence` (`src/auth/native-login-fence.ts`) over the pure `isTrustedNetworkAddress` (`src/auth/trusted-network.ts`), admitting the IPv4 networks `NATIVE_LOGIN_CIDRS` names — by default `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` and loopback — reading an IPv4-mapped IPv6 address as the IPv4 it carries, always admitting `::1`, and refusing everything else, every other IPv6 address included. The list is parsed once at boot, and an entry that is not an IPv4 CIDR refuses the boot rather than silently widening or narrowing the fence. The address is `req.ip` under the proxy trust `TRUST_PROXY` sets in `main.ts` (default one hop, parsed once at boot by `parseTrustProxy`, which refuses an empty or negative value); no header is parsed by hand. A caller outside is refused with 403 *before* `argon2.verify` runs, so the endpoint tells them nothing about the password. Deliberately not an on/off flag — flipping one is a redeploy, and a redeploy is what you cannot count on in the situation the path exists for (ADR-0004). `GET /api/auth/methods` reports whether this caller is inside, so the login card shows the password form instead of guessing from its own address.
_Avoid_: IP allowlist (it narrows who may try, not who may succeed), second factor (it is a reachability precondition, not a factor), home network (the trusted networks are whatever the deployment names)

**Session Role**:
The `admin` | `self` value carried in the `tegata_token` JWT's `role` claim, set at login and reported by `GET /api/auth/check`. Native Login (from inside the Break-Glass Fence) and OIDC login for a caller in `OIDC_REQUIRED_GROUP` both produce `admin`; OIDC login for any other Authelia user produces `self`, with `sub` set to their username in both OIDC cases (native login carries no `sub`). `AuthGuard` — the guard on every admin route — requires `role === 'admin'`; a `self` session is authenticated but reaches none of them.

**Self-Service Profile**:
`ProfileController` (`/api/profile`), a write surface structurally separate from `UsersController` so an admin-CRUD change can never accidentally widen self-service, or vice versa. Guarded by its own `ProfileGuard` — distinct from `AuthGuard` — which accepts a structurally valid token carrying `sub` regardless of Session Role, since both `admin` and `self` sessions manage their own account. It also re-reads that `sub` from the Authelia Users Database on every request and answers 401 when the user is Disabled or gone, so Disabling a user ends their self-service at once rather than when their session token expires — sessions have no other revocation. `PATCH /api/profile` accepts only `displayname`/`email`, resolving the username to update from the token's `sub`, never a request body/param. `POST /api/profile/password` requires the caller's current password (`UsersService.verifyPassword`, an `argon2.verify` check against their own Authelia Users Database entry) before calling `resetPassword`, and is throttled the same as `POST /auth/login`. Group membership and username are unreachable through this surface — the DTOs simply don't accept those fields.

**Baseline Hash**:
The hash of the Authelia Users Database recorded after Tegata's own last write, or after an admin explicitly performs an Accept Baseline. The reference point an Out-of-Band Edit is detected against.

**Out-of-Band Edit**:
The state where the Authelia Users Database's current on-disk hash no longer matches the Baseline Hash — meaning something other than Tegata's own `writeDatabase()` changed the file. Detected on every `readDatabase()` call; surfaced to the admin UI via a separate status endpoint, never blocks an operation in progress.
_Avoid_: Drift, tampering (implies malice; this also covers legitimate emergency repairs)

**Unreadable Users Database**:
The state where the Authelia Users Database can't be turned into a `{ users: {...} }` mapping at all: the file exists but can't be read (any error other than `ENOENT`), exists but doesn't parse as YAML, parses to something without a `users` mapping (a zero-byte truncation included), or is `ENOENT` after a Baseline Hash has already been recorded (a file that was live and is now gone — `ENOENT` with no Baseline Hash ever recorded is the fresh-install path instead, and starts empty). Worked out fresh on every read rather than stored, so it clears itself the moment a valid file reappears — no admin action required. Distinct from an Out-of-Band Edit: an edit is a file Tegata can still read that just doesn't match its own last write, and only ever gets reported; an unreadable database can't be read at all, and every write is refused with a 503 explaining why instead of silently overwriting the real file with an empty map.
_Avoid_: Corrupt database (the file itself may be fine — an `ENOENT` with a Baseline Hash on record is unreadable too)

**Accept Baseline**:
The admin action that sets the Baseline Hash to the file's current on-disk hash, clearing an Out-of-Band Edit. The only way the warning goes away — there is no separate dismiss/snooze. Also how the Baseline Hash gets set for the first time after this feature ships, since there is no automatic seeding.

**Enabled-Count Guard**:
A check on `deleteUser`, on `updateUser` when it sets Disabled or changes `groups`, and on Group Deletion's users-database write, refusing the write (pending a `confirm: true` retry) if it would either drop the enabled-user count to 0 or 1, or leave a Guarded Group with zero enabled members. Counts only enabled users/members — a Disabled account was already unable to authenticate, so it doesn't factor into either count this guards, and a Guarded Group already at zero enabled members never re-triggers it. The 409 body carries both conditions: `enabledCount` (unchanged from the count-only guard) plus `emptiedGroups: string[]` (the Guarded Groups this write would empty, `[]` when only the count condition fired); `message` names any emptied group. A single `confirm: true` overrides both conditions at once.
_Avoid_: Lockout guard (the guard prevents a specific write, not general lockout — Native Login still answers regardless of which groups end up empty, though only from inside the Break-Glass Fence)

**Guarded Group**:
A group the Enabled-Count Guard also protects from losing its last enabled member: `OIDC_REQUIRED_GROUP` always, plus any group named in the optional comma-separated `GUARDED_GROUPS` env var (same parsing convention as `ACCESS_PREVIEW_OPEN_POLICIES` — trimmed, empty entries dropped, duplicates collapsed). A typical deployment sets `GUARDED_GROUPS=admins`, covering an Authelia `group:admins` catch-all subject (a literal in Authelia's access-control rules, not otherwise known to Tegata) alongside the OIDC admin group. Deliberately not derived from the Access Preview parser — it's a fixed, deploy-time list.
_Avoid_: Admin group (there may be two: `OIDC_REQUIRED_GROUP` and an Authelia-side `admins`, and Guarded Groups covers both plus whatever else `GUARDED_GROUPS` lists)
