import type { ConfigService } from '@nestjs/config'
import { parseCommaList } from '../config/parse-comma-list'

/** Shared with `OidcService.getRequiredGroup()` so the fallback can't drift between the two readers. */
export const DEFAULT_OIDC_REQUIRED_GROUP = 'tegata'

/**
 * `OIDC_REQUIRED_GROUP` is always guarded (it's the sole admin/self decision point, ADR-0003);
 * `GUARDED_GROUPS` adds any other groups a deploy wants covered (e.g. Authelia's `admins` catch-all
 * subject, which isn't otherwise known to Tegata). Same comma-list convention as ACCESS_PREVIEW_OPEN_POLICIES.
 */
export function getGuardedGroups(config: ConfigService): string[] {
  const requiredGroup = config.get<string>('OIDC_REQUIRED_GROUP', DEFAULT_OIDC_REQUIRED_GROUP)
  const extraGroups = parseCommaList(config.get<string>('GUARDED_GROUPS', ''))

  return [
    ...new Set([requiredGroup, ...extraGroups]),
  ]
}
