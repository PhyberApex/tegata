import { describe, expect, it } from 'vitest'
import { buildAccessPreviews } from './access-preview.parser'

function previewFor(previews: ReturnType<typeof buildAccessPreviews>, group: string) {
  const found = previews.find(p => p.group === group)
  if (!found)
    throw new Error(`No preview for group "${group}"`)
  return found
}

describe('buildAccessPreviews', () => {
  describe('group-placeholder domain rules', () => {
    const config = {
      access_control: {
        default_policy: 'deny',
        rules: [
          { domain: 'auth.example.com', policy: 'bypass' },
          { domain: '{group}.example.com', policy: 'two_factor' },
        ],
      },
    }

    it('should substitute each known group into the placeholder domain', () => {
      const previews = buildAccessPreviews(config, ['media', 'recipes'])

      expect(previewFor(previews, 'media').domains).toEqual([
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
      expect(previewFor(previews, 'recipes').domains).toEqual([
        { domain: 'recipes.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
    })

    it('should not surface rules that reference no group', () => {
      const previews = buildAccessPreviews(config, ['media'])

      const media = previewFor(previews, 'media')
      expect(media.domains).toHaveLength(1)
      expect(media.notes).toEqual([])
    })
  })

  describe('group-subject rules', () => {
    it('should grant the rule domain to the subject group', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', subject: 'group:admins', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['admins'])

      expect(previewFor(previews, 'admins').domains).toEqual([
        { domain: '*.example.com', policy: 'two_factor', source: 'group-subject' },
      ])
    })

    it('should handle a domain list and single-element subject list forms', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['a.example.com', 'b.example.com'],
              subject: ['group:media'],
              policy: 'one_factor',
            },
            {
              domain: 'c.example.com',
              subject: [
                ['group:media'],
              ],
              policy: 'two_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([
        { domain: 'a.example.com', policy: 'one_factor', source: 'group-subject' },
        { domain: 'b.example.com', policy: 'one_factor', source: 'group-subject' },
        { domain: 'c.example.com', policy: 'two_factor', source: 'group-subject' },
      ])
    })

    it('should not list deny rules as grants', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'x.example.com', subject: 'group:media', policy: 'deny' },
            { domain: '{group}.example.com', policy: 'deny' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([])
      expect(previewFor(previews, 'media').notes).toEqual([])
    })

    it('should create previews for groups referenced in config but not known', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'x.example.com', subject: 'group:ghosts', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, [])

      expect(previewFor(previews, 'ghosts').domains).toHaveLength(1)
    })
  })

  describe('group-subject OR lists', () => {
    it('should grant the domain to every group in an OR-list subject', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'photos.example.com',
              subject: ['group:a', 'group:b'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['a', 'b'])

      for (const group of ['a', 'b']) {
        expect(previewFor(previews, group).domains).toEqual([
          { domain: 'photos.example.com', policy: 'one_factor', source: 'group-subject' },
        ])
        expect(previewFor(previews, group).notes).toEqual([])
      }
    })

    it('should grant a group listed alongside a non-group subject without a note', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'photos.example.com',
              subject: ['group:a', 'user:bob'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['a'])

      expect(previewFor(previews, 'a').domains).toHaveLength(1)
      expect(previewFor(previews, 'a').notes).toEqual([])
    })

    it('should let a deny decide the domain for only its own group', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'photos.example.com', subject: 'group:a', policy: 'deny' },
            {
              domain: 'photos.example.com',
              subject: ['group:a', 'group:b'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['a', 'b'])

      expect(previewFor(previews, 'a').domains).toEqual([])
      expect(previewFor(previews, 'b').domains).toHaveLength(1)
    })
  })

  describe('rule order', () => {
    it('should let a deny ahead of a placeholder grant decide that domain', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'media.example.com', policy: 'deny' },
            { domain: '{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media', 'recipes'])

      expect(previewFor(previews, 'media').domains).toEqual([])
      expect(previewFor(previews, 'recipes').domains).toEqual([
        { domain: 'recipes.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
    })

    it('should let a group-subject deny decide its domains for that group only', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['a.example.com', 'b.example.com'],
              subject: ['group:media', 'user:bob'],
              policy: 'deny',
            },
            {
              domain: ['a.example.com', 'c.example.com'],
              subject: 'group:media',
              policy: 'one_factor',
            },
            { domain: 'b.example.com', subject: 'group:recipes', policy: 'one_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media', 'recipes'])

      expect(previewFor(previews, 'media').domains).toEqual([
        { domain: 'c.example.com', policy: 'one_factor', source: 'group-subject' },
      ])
      expect(previewFor(previews, 'recipes').domains).toEqual([
        { domain: 'b.example.com', policy: 'one_factor', source: 'group-subject' },
      ])
    })

    it('should still grant after a deny that matches only some requests', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'media.example.com',
              resources: ['^/admin(/.*)?$'],
              policy: 'deny',
            },
            {
              domain: 'media.example.com',
              subject: [
                ['group:media', 'group:admins'],
              ],
              policy: 'deny',
            },
            { domain: 'media.example.com', subject: 'user:bob', policy: 'deny' },
            { domain: '{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
    })

    it('should let a deny decide its literal domains alongside a domain_regex', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'media.example.com', domain_regex: '^vault\\.example\\.com$', policy: 'deny' },
            { domain: '{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([])
    })

    it('should honour a deny that follows the grant', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '{group}.example.com', policy: 'two_factor' },
            { domain: 'media.example.com', policy: 'deny' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toHaveLength(1)
    })
  })

  describe('unparsed group-referencing rules', () => {
    it('should surface an inner AND list of groups as notes for each referenced group', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'x.example.com',
              subject: [
                ['group:a', 'group:b'],
              ],
              policy: 'two_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['a', 'b'])

      expect(previewFor(previews, 'a').domains).toEqual([])
      expect(previewFor(previews, 'a').notes).toHaveLength(1)
      expect(previewFor(previews, 'a').notes[0]).toContain('x.example.com')
      expect(previewFor(previews, 'b').domains).toEqual([])
      expect(previewFor(previews, 'b').notes).toHaveLength(1)
    })

    it('should surface group rules with extra qualifiers as notes', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'x.example.com',
              subject: 'group:media',
              resources: ['^/api(/.*)?$'],
              policy: 'bypass',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([])
      expect(previewFor(previews, 'media').notes).toHaveLength(1)
    })

    it('should ignore non-group rules with qualifiers entirely', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'uptime.example.com',
              resources: ['^/api(/.*)?$'],
              networks: ['192.168.0.0/16'],
              policy: 'bypass',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['media'])

      expect(previewFor(previews, 'media').domains).toEqual([])
      expect(previewFor(previews, 'media').notes).toEqual([])
    })
  })

  describe('oidc authorization policies', () => {
    const config = {
      identity_providers: {
        oidc: {
          authorization_policies: {
            recipes: {
              default_policy: 'deny',
              rules: [
                { policy: 'two_factor', subject: 'group:admins' },
                { policy: 'two_factor', subject: 'group:recipes' },
              ],
            },
          },
          clients: [
            { client_id: 'mealie-id', client_name: 'Mealie', authorization_policy: 'recipes' },
          ],
        },
      },
    }

    it('should resolve policies to client display names per group', () => {
      const previews = buildAccessPreviews(config, ['admins', 'recipes'])

      expect(previewFor(previews, 'recipes').oidcClients).toEqual([
        { clientName: 'Mealie', policyName: 'recipes', policy: 'two_factor' },
      ])
      expect(previewFor(previews, 'admins').oidcClients).toEqual([
        { clientName: 'Mealie', policyName: 'recipes', policy: 'two_factor' },
      ])
    })

    it('should ignore deny rules inside policies', () => {
      const denyConfig = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              locked: {
                default_policy: 'deny',
                rules: [
                  { policy: 'deny', subject: 'group:media' },
                ],
              },
            },
            clients: [
              { client_id: 'app', client_name: 'App', authorization_policy: 'locked' },
            ],
          },
        },
      }

      const previews = buildAccessPreviews(denyConfig, ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([])
    })

    it('should let a deny ahead of a grant decide that group for the policy', () => {
      const orderedConfig = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              media: {
                default_policy: 'deny',
                rules: [
                  { policy: 'deny', subject: 'group:media' },
                  { policy: 'two_factor', subject: 'group:media' },
                  {
                    policy: 'deny',
                    subject: ['user:bob', 'group:guests'],
                  },
                  { policy: 'two_factor', subject: 'group:guests' },
                  {
                    policy: 'deny',
                    subject: 'group:lan',
                    networks: ['10.0.0.0/8'],
                  },
                  {
                    policy: 'deny',
                    subject: [
                      ['group:lan', 'group:guests'],
                    ],
                  },
                  { policy: 'one_factor', subject: 'group:lan' },
                ],
              },
            },
            clients: [
              { client_id: 'jellyfin', client_name: 'Jellyfin', authorization_policy: 'media' },
            ],
          },
        },
      }

      const previews = buildAccessPreviews(orderedConfig, ['media', 'guests', 'lan'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([])
      expect(previewFor(previews, 'guests').oidcClients).toEqual([])
      expect(previewFor(previews, 'lan').oidcClients).toEqual([
        { clientName: 'Jellyfin', policyName: 'media', policy: 'one_factor' },
      ])
    })

    it('should keep the first matching rule for a group, not the last', () => {
      const orderedConfig = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              media: {
                rules: [
                  { policy: 'one_factor', subject: 'group:media' },
                  { policy: 'two_factor', subject: 'group:media' },
                  { policy: 'deny', subject: 'group:media' },
                ],
              },
            },
            clients: [
              { client_id: 'jellyfin', client_name: 'Jellyfin', authorization_policy: 'media' },
            ],
          },
        },
      }

      const previews = buildAccessPreviews(orderedConfig, ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([
        { clientName: 'Jellyfin', policyName: 'media', policy: 'one_factor' },
      ])
    })

    it('should fall back to client_id when client_name is missing', () => {
      const namelessConfig = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              recipes: {
                rules: [
                  { policy: 'two_factor', subject: 'group:recipes' },
                ],
              },
            },
            clients: [
              { client_id: 'mealie-id', authorization_policy: 'recipes' },
            ],
          },
        },
      }

      const previews = buildAccessPreviews(namelessConfig, ['recipes'])

      expect(previewFor(previews, 'recipes').oidcClients).toEqual([
        { clientName: 'mealie-id', policyName: 'recipes', policy: 'two_factor' },
      ])
    })

    it('should skip clients using builtin policies', () => {
      const builtinConfig = {
        identity_providers: {
          oidc: {
            clients: [
              { client_id: 'open', client_name: 'Open App', authorization_policy: 'two_factor' },
            ],
          },
        },
      }

      const previews = buildAccessPreviews(builtinConfig, ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([])
    })

    it('should surface unparsed policy rules that reference groups as notes', () => {
      const oddConfig = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              odd: {
                rules: [
                  {
                    policy: 'two_factor',
                    subject: ['group:media', 'user:bob'],
                  },
                ],
              },
            },
            clients: [],
          },
        },
      }

      const previews = buildAccessPreviews(oddConfig, ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([])
      expect(previewFor(previews, 'media').notes).toHaveLength(1)
      expect(previewFor(previews, 'media').notes[0]).toContain('odd')
    })
  })

  describe('output shape', () => {
    it('should return previews sorted by group name including empty known groups', () => {
      const previews = buildAccessPreviews({}, ['zeta', 'alpha'])

      expect(previews.map(p => p.group)).toEqual(['alpha', 'zeta'])
      expect(previews[0]).toEqual({
        group: 'alpha',
        domains: [],
        oidcClients: [],
        notes: [],
      })
    })

    it('should tolerate a null or malformed config', () => {
      expect(buildAccessPreviews(null, ['a'])).toHaveLength(1)
      expect(buildAccessPreviews({
        access_control: { rules: 'nope' },
      }, ['a'])).toHaveLength(1)
      expect(buildAccessPreviews({
        identity_providers: {
          oidc: { clients: 42 },
        },
      }, ['a'])).toHaveLength(1)
    })
  })
})
