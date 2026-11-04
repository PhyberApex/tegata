# Self-service profile reuses the existing OIDC flow, not reverse-proxy forward-auth headers

The obvious way to let any Authelia user edit their own profile was to put `/profile` behind the reverse proxy's Authelia forward-auth middleware and trust the `Remote-User`/`Remote-Groups` headers it sets at the app layer. We rejected that: in the typical compose deployment nothing strips those headers from a request that did not come through the proxy, and every container on the shared network can reach `tegata:3000` directly — any sibling container could forge them. Tegata already has a proven, PKCE-based OIDC exchange (`OidcService`) used for admin SSO login; `/profile` reuses that exact mechanism instead, so no new trust boundary is introduced.

## Considered Options

- **Forward-auth headers**: cheaper in isolation, but would have required header-stripping proxy middleware and a path-scoped router split, both of which a deployment has to get right — for the one endpoint where getting it wrong turns a convenience feature into an auth bypass.
- **Reuse `OidcService`** (chosen): more existing code reused, zero new trust primitives, and the browser round-trip is silent since the Authelia session already exists by the time `/profile` is reached.

## Consequences

- Authelia's authorization policy for the Tegata client (which gates who can obtain an OIDC code for it at all) admits any authenticated Authelia user rather than only the admin group. `OIDC_REQUIRED_GROUP` is unchanged and still decides `admin` vs. the new `self` Session Role inside Tegata's own app code.
- `AuthGuard` must check `role === 'admin'` explicitly. Before this change every valid Tegata JWT was implicitly an admin token — native login always issues `role: 'admin'`, and OIDC login was pre-gated to the admin group — so `AuthGuard` never needed to inspect the role claim. Once `self`-role tokens exist, skipping that check would let any user's self-service session reach the full admin CRUD API.
