# The Break-Glass Fence admits IPv6 networks

Supersedes the IPv6 paragraph of [ADR-0004](0004-native-password-login-is-fenced-to-trusted-networks-not-removed.md), which read the trusted networks as IPv4 CIDRs only and refused every IPv6 address except `::1` and IPv4-mapped ones. That left dual-stack LANs, ULA (`fd00::/8`) or link-local (`fe80::/10`) overlays such as WireGuard and Tailscale, and IPv6-only hosts unable to opt in to the break-glass login. The rest of ADR-0004 stands.

`NATIVE_LOGIN_CIDRS` entries are now IPv4 or IPv6 CIDRs (`fd00::/8`, `2001:db8::/32`); a bare address is a /32 or /128, and host bits below the prefix are masked off. A malformed entry of either family still fails the boot, named in the error. An IPv6 source address is matched against the IPv6 networks; an IPv4-mapped address is still unwrapped and matched against the IPv4 networks only; a zone id (`fe80::1%eth0`) is stripped before matching; `::1` is always admitted. The default list is unchanged, so existing deployments see no difference: IPv6 sources stay refused until a deployment names an IPv6 network.

## Considered Options

- **Depend on `ipaddr.js`** (a transitive dependency of Express): rejected because it is only transitive, so relying on it would be an undeclared dependency, and the rule needs only prefix masking of 128-bit numbers, which `BigInt` does in a few lines under the existing spec.
- **Hand-rolled 128-bit parsing and masking** (chosen), kept in the pure `trusted-network.ts` and covered by tests.
- **Admit all of `fc00::/7` and `fe80::/10` by default**: rejected; it would widen the fence for existing deployments, and ADR-0004's default is deliberately the fence as first built.
