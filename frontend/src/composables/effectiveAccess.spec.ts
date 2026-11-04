import type { AccessPreviewResponse, User } from '../types'
import { describe, expect, it } from 'vitest'
import { computeEffectiveAccess, computeEmptiedGuardedGroups, diffEffectiveAccess, haveGroupsChanged } from './effectiveAccess'

function preview(overrides: Partial<AccessPreviewResponse & { available: true }>) {
  const response: AccessPreviewResponse = {
    available: true,
    previews: [],
    configNotes: [],
    guardedGroups: [],
    ...overrides,
  }
  return response
}

function user(overrides: Partial<User>): User {
  return {
    username: 'user',
    displayname: 'User',
    email: 'user@example.com',
    groups: [],
    disabled: false,
    ...overrides,
  }
}

const RESPONSE = preview({
  previews: [
    {
      group: 'media',
      domains: [
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ],
      oidcClients: [
        { clientName: 'Jellyfin', policyName: 'media', policy: 'two_factor' },
      ],
      notes: [],
    },
    {
      group: 'admins',
      domains: [
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-subject' },
        { domain: '*.example.com', policy: 'two_factor', source: 'group-subject' },
      ],
      oidcClients: [],
      notes: ['unparsed rule referencing admins'],
    },
    {
      group: 'recipes',
      domains: [],
      oidcClients: [],
      notes: [],
    },
  ],
})

describe('computeEffectiveAccess', () => {
  it('unions distinct access across multiple groups, attributing each grant to its group', () => {
    const result = computeEffectiveAccess(RESPONSE, ['media', 'admins'])

    expect(result.available).toBe(true)
    if (!result.available)
      return

    expect(result.domains).toEqual([
      {
        domain: 'media.example.com',
        policy: 'two_factor',
        source: 'group-placeholder',
        group: 'media',
      },
      {
        domain: 'media.example.com',
        policy: 'two_factor',
        source: 'group-subject',
        group: 'admins',
      },
      {
        domain: '*.example.com',
        policy: 'two_factor',
        source: 'group-subject',
        group: 'admins',
      },
    ])
    expect(result.oidcClients).toEqual([
      {
        clientName: 'Jellyfin',
        policyName: 'media',
        policy: 'two_factor',
        group: 'media',
      },
    ])
    expect(result.notes).toEqual([
      { group: 'admins', note: 'unparsed rule referencing admins' },
    ])
  })

  it('does not duplicate overlapping grants beyond one entry per granting group', () => {
    const result = computeEffectiveAccess(RESPONSE, ['media', 'admins'])
    if (!result.available)
      throw new Error('expected available result')

    const mediaComGrants = result.domains.filter(d => d.domain === 'media.example.com')
    expect(mediaComGrants).toHaveLength(2)
  })

  it('excludes groups with no matching rules without affecting other groups', () => {
    const result = computeEffectiveAccess(RESPONSE, ['media', 'recipes'])
    if (!result.available)
      throw new Error('expected available result')

    expect(result.domains).toEqual([
      {
        domain: 'media.example.com',
        policy: 'two_factor',
        source: 'group-placeholder',
        group: 'media',
      },
    ])
  })

  it('returns a confirmed-empty result for zero groups, not unavailable', () => {
    const result = computeEffectiveAccess(RESPONSE, [])

    expect(result).toEqual({
      available: true,
      domains: [],
      oidcClients: [],
      notes: [],
    })
  })

  it('propagates unavailability from the underlying access-preview response', () => {
    const response: AccessPreviewResponse = { available: false, reason: 'Could not read Authelia configuration', guardedGroups: [] }

    const result = computeEffectiveAccess(response, ['media'])

    expect(result).toEqual({ available: false, reason: 'Could not read Authelia configuration' })
  })
})

describe('diffEffectiveAccess', () => {
  it('reports domains and oidc clients only present on the proposed side as added', () => {
    const current = computeEffectiveAccess(RESPONSE, ['recipes'])
    const proposed = computeEffectiveAccess(RESPONSE, ['recipes', 'media'])

    const diff = diffEffectiveAccess(current, proposed)

    expect(diff).toEqual({
      available: true,
      addedDomains: [
        {
          domain: 'media.example.com',
          policy: 'two_factor',
          source: 'group-placeholder',
          group: 'media',
        },
      ],
      removedDomains: [],
      addedOidcClients: [
        {
          clientName: 'Jellyfin',
          policyName: 'media',
          policy: 'two_factor',
          group: 'media',
        },
      ],
      removedOidcClients: [],
    })
  })

  it('reports domains and oidc clients only present on the current side as removed', () => {
    const current = computeEffectiveAccess(RESPONSE, ['recipes', 'media'])
    const proposed = computeEffectiveAccess(RESPONSE, ['recipes'])

    const diff = diffEffectiveAccess(current, proposed)

    expect(diff).toEqual({
      available: true,
      addedDomains: [],
      removedDomains: [
        {
          domain: 'media.example.com',
          policy: 'two_factor',
          source: 'group-placeholder',
          group: 'media',
        },
      ],
      addedOidcClients: [],
      removedOidcClients: [
        {
          clientName: 'Jellyfin',
          policyName: 'media',
          policy: 'two_factor',
          group: 'media',
        },
      ],
    })
  })

  it('does not report a domain as removed when another remaining group still grants it', () => {
    // 'admins' also grants media.example.com — dropping 'media' should not surface it as removed.
    const current = computeEffectiveAccess(RESPONSE, ['media', 'admins'])
    const proposed = computeEffectiveAccess(RESPONSE, ['admins'])

    const diff = diffEffectiveAccess(current, proposed)
    if (!diff.available)
      throw new Error('expected available diff')

    expect(diff.removedDomains.some(d => d.domain === 'media.example.com')).toBe(false)
  })

  it('reports no diff entries when a membership change has no net access effect', () => {
    const current = computeEffectiveAccess(RESPONSE, ['media'])
    const proposed = computeEffectiveAccess(RESPONSE, ['media', 'recipes'])

    const diff = diffEffectiveAccess(current, proposed)

    expect(diff).toEqual({
      available: true,
      addedDomains: [],
      removedDomains: [],
      addedOidcClients: [],
      removedOidcClients: [],
    })
  })

  it('says the diff is unavailable when the current side is unavailable, rather than a clean diff', () => {
    const current = computeEffectiveAccess({ available: false, reason: 'boom', guardedGroups: [] }, ['media'])
    const proposed = computeEffectiveAccess(RESPONSE, ['media'])

    expect(diffEffectiveAccess(current, proposed)).toEqual({ available: false, reason: 'boom' })
  })

  it('says the diff is unavailable when the proposed side is unavailable', () => {
    const current = computeEffectiveAccess(RESPONSE, ['media'])
    const proposed = computeEffectiveAccess({ available: false, reason: 'boom', guardedGroups: [] }, ['media'])

    expect(diffEffectiveAccess(current, proposed)).toEqual({ available: false, reason: 'boom' })
  })
})

describe('haveGroupsChanged', () => {
  it('reports no change for identical group lists', () => {
    expect(haveGroupsChanged(['media', 'admins'], ['media', 'admins'])).toBe(false)
  })

  it('reports no change when the same groups appear in a different order', () => {
    expect(haveGroupsChanged(['media', 'admins'], ['admins', 'media'])).toBe(false)
  })

  it('reports no change for two empty lists', () => {
    expect(haveGroupsChanged([], [])).toBe(false)
  })

  it('reports a change when a group is added', () => {
    expect(haveGroupsChanged(['media'], ['media', 'admins'])).toBe(true)
  })

  it('reports a change when a group is removed', () => {
    expect(haveGroupsChanged(['media', 'admins'], ['media'])).toBe(true)
  })

  it('reports a change when the same number of groups differ in membership', () => {
    expect(haveGroupsChanged(['media'], ['admins'])).toBe(true)
  })
})

describe('computeEmptiedGuardedGroups', () => {
  const users = [
    user({
      username: 'alice',
      groups: ['admins', 'users'],
    }),
    user({
      username: 'bob',
      groups: ['users'],
    }),
    user({
      username: 'carol',
      groups: ['users'],
      disabled: true,
    }),
  ]

  it('names a Guarded Group left with no enabled members', () => {
    expect(computeEmptiedGuardedGroups(users, ['admins'], 'alice', ['users'])).toEqual(['admins'])
  })

  it('does not name a group the user is not the last enabled member of', () => {
    expect(computeEmptiedGuardedGroups(users, ['users'], 'alice', [])).toEqual([])
  })

  it('ignores groups that are not in the Guarded Groups list', () => {
    expect(computeEmptiedGuardedGroups(users, ['users'], 'alice', ['users'])).toEqual([])
  })

  it('does not trigger when the affected user keeps membership in the proposed groups', () => {
    expect(computeEmptiedGuardedGroups(users, ['admins'], 'alice', ['admins', 'users'])).toEqual([])
  })

  it('does not trigger for a Guarded Group that was already empty of enabled members', () => {
    expect(computeEmptiedGuardedGroups(users, ['moderators'], 'alice', ['users'])).toEqual([])
  })

  it('does not trigger when removing an already-disabled member from a Guarded Group', () => {
    const withDisabledAdmin = [
      ...users,
      user({
        username: 'dave',
        groups: ['admins'],
        disabled: true,
      }),
    ]

    expect(computeEmptiedGuardedGroups(withDisabledAdmin, ['admins'], 'dave', [])).toEqual([])
  })

  it('reports every emptied group when more than one is guarded', () => {
    const soleGuardedMember = [
      user({
        username: 'alice',
        groups: ['admins', 'tegata'],
      }),
      user({
        username: 'bob',
        groups: ['users'],
      }),
    ]

    expect(computeEmptiedGuardedGroups(soleGuardedMember, ['admins', 'tegata'], 'alice', [])).toEqual(['admins', 'tegata'])
  })
})
