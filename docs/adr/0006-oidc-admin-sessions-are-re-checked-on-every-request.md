# OIDC admin sessions are re-checked against the users database on every request

Amends the consequences of [ADR-0003](0003-self-service-profile-reuses-oidc-not-forward-auth-headers.md), under which `OIDC_REQUIRED_GROUP` membership was decided only at OIDC callback time and then trusted for the full 24h life of the `admin` token. `ProfileGuard` already re-read the user on every request, so Disabling a user ended their self-service at once — but the more privileged admin API had no such check. An admin who was Disabled, deleted or removed from `OIDC_REQUIRED_GROUP` kept full admin access (create users, reset any password, mint invites, and re-enable themselves) until the token expired.

`AuthGuard` and `GET /api/auth/check` now pass every `admin` token through `AdminAccountCheck`: when the token carries a `sub`, that user is re-read from the Authelia Users Database and must exist, be Enabled and still list `OIDC_REQUIRED_GROUP` in `groups`, or the request answers 401. `/api/auth/check` applies the same check so the SPA's router guard sends a revoked admin to the login page instead of rendering a shell whose every call fails.

## Considered Options

- **Shorter token lifetime**: narrows the window without closing it, and costs every admin more logins.
- **A revocation list in SQLite**: a second source of truth for something the users database already says.
- **Re-read the users database on every admin request** (chosen): the same per-request read `ProfileGuard` already does, so it adds no new mechanism.

## Consequences

- A token without `sub` is a Native Login session — the break-glass path, with no user behind it — and is admitted exactly as before.
- An Unreadable Users Database admits the session without re-checking it (logged at warn level). Refusing would lock every OIDC admin out of the UI in exactly the state they need it to see the banner and repair, which is worse than the gap; it uses a tolerant read (`UsersService.lookupAccount`), not the 503-throwing one.
- `AdminAccountCheck` is provided by a small `@Global()` `AdminAccountCheckModule` that imports `UsersModule`, because `UsersModule` already imports `AuthModule` and `AuthGuard` is instantiated in every module whose controllers use it.
- Group membership is now decided twice for an OIDC admin: at callback time (which Session Role the token gets) and on every request (whether an `admin` token still counts). A user *added* to `OIDC_REQUIRED_GROUP` still has to log in again to get an `admin` session.
