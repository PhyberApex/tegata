# Tegata Frontend

Vue 3 admin panel for Tegata. Most domain vocabulary (User, Group, Invite, Redemption, Authelia Users Database) lives in [`../backend/CONTEXT.md`](../backend/CONTEXT.md) and applies here unchanged — this file covers only concepts specific to the UI layer.

## Language

**Admin Session**:
A logged-in session whose Session Role (see backend CONTEXT.md) is `admin`, held alongside the module-level `authenticated` ref (`useAuth.ts`) and backed by a JWT session cookie. Reaches the full admin UI (`/`, `/invites`, `/groups`, `/bundles`) — native shared-password login (only from inside the Break-Glass Fence — see backend CONTEXT.md) and admin OIDC login both produce one.
_Avoid_: Login state, auth state

**Self Session**:
A logged-in session whose Session Role is `self` — same JWT-cookie mechanism as an Admin Session, distinguished only by the `role` claim. Router-guarded to `/profile` only: `router.ts`'s `beforeEach` redirects it away from every admin-only route, and `App.vue`'s nav doesn't render admin links for it. Always the product of OIDC/SSO login by an Authelia user outside the admin group — never available via native shared-password login.

**Invite Redemption Flow**:
The public, unauthenticated `/register/:token` view: validates the token (`GET /api/invites/:token/validate`), shows which Groups it grants, and on submit calls the Redemption endpoint. Reachable without an Admin Session — it's the one part of the app invite recipients use directly.

**Reset Redemption Flow**:
The public, unauthenticated `/reset/:token` view: validates a Reset Token and lets its user set a new password. The sibling of the Invite Redemption Flow for existing accounts — reachable without an Admin Session.

**Membership Projection**:
Any group-side display of who belongs to a group (member lists, member counts). Always derived client-side by filtering the users list on each user's `groups` array — membership is owned by user records in the Authelia Users Database, never stored group-side, and every membership write goes through the users database — the user update endpoint, or Group Deletion stripping a deleted group from every member (backend CONTEXT.md) — so the group view can never drift from the user view.
_Avoid_: Group members list (as a data source — it's a view, not a store)
