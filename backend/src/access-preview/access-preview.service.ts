import type { AccessPreviewResponse } from './access-preview.types'
import { readFileSync } from 'node:fs'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as yaml from 'js-yaml'
import { parseCommaList } from '../config/parse-comma-list'
import { GroupsService } from '../groups/groups.service'
import { getGuardedGroups } from '../users/guarded-groups'
import { buildConfigNotes } from './access-preview.config-notes'
import { buildAccessPreviews } from './access-preview.parser'

// A YAMLException's message embeds a snippet of the surrounding source lines,
// and configuration.yml usually inlines secrets — so build the reason from the
// bare reason and position only, never from err.message or mark.snippet.
function describeConfigLoadError(err: unknown): string {
  if (err instanceof yaml.YAMLException) {
    const position = err.mark
      ? ` (line ${err.mark.line + 1}, column ${err.mark.column + 1})`
      : ''
    return `Authelia configuration is not valid YAML${position}: ${err.reason}`
  }
  return `Could not read Authelia configuration: ${err instanceof Error
    ? err.message
    : String(err)}`
}

@Injectable()
export class AccessPreviewService {
  private readonly configPath: string
  private readonly acknowledgedOpenPolicies: string[]
  private readonly guardedGroups: string[]
  private readonly logger = new Logger(AccessPreviewService.name)

  constructor(
    config: ConfigService,
    private readonly groupsService: GroupsService,
  ) {
    this.configPath = config.get<string>(
      'AUTHELIA_CONFIG_FILE',
      '/authelia-config/configuration.yml',
    )
    this.acknowledgedOpenPolicies = parseCommaList(config.get<string>('ACCESS_PREVIEW_OPEN_POLICIES', ''))
    this.guardedGroups = getGuardedGroups(config)
  }

  getPreviews(): AccessPreviewResponse {
    let parsed: unknown
    try {
      parsed = yaml.load(readFileSync(this.configPath, 'utf-8'))
    }
    catch (err) {
      const reason = describeConfigLoadError(err)
      this.logger.warn(reason)
      return { available: false, reason, guardedGroups: this.guardedGroups }
    }

    return {
      available: true,
      previews: buildAccessPreviews(parsed, this.groupsService.getGroupNames()),
      configNotes: buildConfigNotes(parsed, this.acknowledgedOpenPolicies),
      guardedGroups: this.guardedGroups,
    }
  }
}
