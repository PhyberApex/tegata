import { describe, expect, it } from 'vitest'
import { buildConfigNotes } from './access-preview.config-notes'

function policy(name: string, defaultPolicy: string) {
  return {
    default_policy: defaultPolicy,
    rules: [
      { policy: 'two_factor', subject: 'group:admins' },
      { policy: 'two_factor', subject: `group:${name}` },
    ],
  }
}

function client(clientId: string, clientName: string, authorizationPolicy?: string) {
  return {
    client_id: clientId,
    client_name: clientName,
    ...(authorizationPolicy === undefined
      ? {}
      : { authorization_policy: authorizationPolicy }),
  }
}

// Mirrors today's rendered identity_providers.oidc block from
// authelia-configuration.yml.j2 (with `{{ authelia_default_policy }}` rendered as two_factor).
function baseConfig() {
  return {
    identity_providers: {
      oidc: {
        authorization_policies: {
          recipes: policy('recipes', 'deny'),
          actual: policy('actual', 'deny'),
          passwords: policy('passwords', 'deny'),
          homebox: policy('homebox', 'deny'),
          n8n: policy('n8n', 'deny'),
          links: policy('links', 'deny'),
          documents: policy('documents', 'deny'),
          photos: policy('photos', 'deny'),
          grafana: policy('grafana', 'deny'),
          trips: policy('trips', 'deny'),
          tegata: policy('tegata', 'two_factor'),
          chaptarr: policy('chaptarr', 'deny'),
          grimmory: policy('grimmory', 'two_factor'),
        },
        clients: [
          client('mealie-id', 'Mealie', 'recipes'),
          client('actual-id', 'Actual Budget', 'actual'),
          client('vaultwarden-id', 'Vaultwarden', 'passwords'),
          client('homebox-id', 'HomeBox', 'homebox'),
          client('n8n-id', 'n8n', 'n8n'),
          client('linkwarden-id', 'Linkwarden', 'links'),
          client('paperless-id', 'Paperless', 'documents'),
          client('immich-id', 'Immich', 'photos'),
          client('grafana-id', 'Grafana', 'grafana'),
          client('trek-id', 'TREK', 'trips'),
          client('tegata-id', 'Tegata', 'tegata'),
          client('chaptarr-id', 'Chaptarr', 'chaptarr'),
          client('grimmory-id', 'Grimmory', 'grimmory'),
        ],
      },
    },
  }
}

function chaptarrShapedConfig() {
  const config = baseConfig()
  const chaptarrClient = config.identity_providers.oidc.clients.find(c => c.client_name === 'Chaptarr')!
  chaptarrClient.authorization_policy = 'tegata'
  config.identity_providers.oidc.authorization_policies.chaptarr.default_policy = 'two_factor'
  return config
}

describe('buildConfigNotes', () => {
  it('gives no notes for today\'s fixture with tegata and grimmory acknowledged', () => {
    expect(buildConfigNotes(baseConfig(), ['tegata', 'grimmory'])).toEqual([])
  })

  it('gives exactly two open-policy notes for grimmory and tegata when nothing is acknowledged', () => {
    const notes = buildConfigNotes(baseConfig(), [])

    expect(notes).toEqual([
      expect.objectContaining({
        kind: 'open-policy',
        policyName: 'grimmory',
        clientNames: ['Grimmory'],
      }),
      expect.objectContaining({
        kind: 'open-policy',
        policyName: 'tegata',
        clientNames: ['Tegata'],
      }),
    ])
  })

  it('gives exactly the three notes from a three-client wiring, in order', () => {
    const notes = buildConfigNotes(chaptarrShapedConfig(), ['tegata', 'grimmory'])

    expect(notes).toEqual([
      expect.objectContaining({
        kind: 'shadowed-policy',
        policyName: 'chaptarr',
        clientNames: ['Chaptarr'],
      }),
      expect.objectContaining({ kind: 'unreferenced-policy', policyName: 'chaptarr', clientNames: [] }),
      expect.objectContaining({
        kind: 'shared-open-policy',
        policyName: 'tegata',
        clientNames: ['Chaptarr', 'Tegata'],
      }),
    ])
  })

  it('does not flag any of the seven role-named policy/client pairs from today\'s fixture', () => {
    const roleNamedPairs: [string, string][] = [
      ['Mealie', 'recipes'],
      ['Actual Budget', 'actual'],
      ['Vaultwarden', 'passwords'],
      ['Linkwarden', 'links'],
      ['Paperless', 'documents'],
      ['Immich', 'photos'],
      ['TREK', 'trips'],
    ]

    for (const [clientName, policyName] of roleNamedPairs) {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              [policyName]: policy(policyName, 'deny'),
            },
            clients: [
              client('id', clientName, policyName),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, [])).toEqual([])
    }
  })

  describe('shadowed-policy', () => {
    it('is case- and punctuation-insensitive when matching a policy named after the client', () => {
      const shadowed = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              'recipes': policy('recipes', 'deny'),
              'home-box': policy('home-box', 'deny'),
            },
            clients: [
              client('id', 'Home Box', 'recipes'),
            ],
          },
        },
      }

      expect(buildConfigNotes(shadowed, [])).toEqual([
        expect.objectContaining({
          kind: 'shadowed-policy',
          policyName: 'home-box',
          clientNames: ['Home Box'],
        }),
        expect.objectContaining({ kind: 'unreferenced-policy', policyName: 'home-box', clientNames: [] }),
      ])
    })

    it('does not fire when the client already uses its own slug-matching policy', () => {
      const notShadowed = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              homebox: policy('homebox', 'deny'),
            },
            clients: [
              client('id', 'HomeBox', 'homebox'),
            ],
          },
        },
      }

      expect(buildConfigNotes(notShadowed, [])).toEqual([])
    })
  })

  describe('unreferenced-policy', () => {
    it('fires for a named policy with no client, whether its default is deny or not', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              orphan: policy('orphan', 'deny'),
              openOrphan: policy('openOrphan', 'two_factor'),
            },
            clients: [],
          },
        },
      }

      const notes = buildConfigNotes(config, [])
      const unreferenced = notes.filter(n => n.kind === 'unreferenced-policy').map(n => n.policyName).sort()
      expect(unreferenced).toEqual(['openOrphan', 'orphan'])
      expect(notes.some(n => n.kind === 'open-policy')).toBe(false)
    })
  })

  describe('open-policy', () => {
    it('fires for default_policy: one_factor, two_factor, missing, or deny-with-a-subject-less-rule', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              a: policy('a', 'one_factor'),
              b: policy('b', 'two_factor'),
              c: {
                rules: [
                  { policy: 'two_factor', subject: `group:c` },
                ],
              },
              d: {
                default_policy: 'deny',
                rules: [
                  { policy: 'two_factor' },
                ],
              },
            },
            clients: [
              client('a-id', 'A', 'a'),
              client('b-id', 'B', 'b'),
              client('c-id', 'C', 'c'),
              client('d-id', 'D', 'd'),
            ],
          },
        },
      }

      const openPolicyNames = buildConfigNotes(config, [])
        .filter(n => n.kind === 'open-policy')
        .map(n => n.policyName)
        .sort()
      expect(openPolicyNames).toEqual(['a', 'b', 'c', 'd'])
    })

    it('does not fire for a deny-default policy whose non-deny rules all have group subjects', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              closed: policy('closed', 'deny'),
            },
            clients: [
              client('id', 'Closed', 'closed'),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, [])).toEqual([])
    })

    it('fires for a client using the two_factor builtin and one with no authorization_policy key', () => {
      const config = {
        identity_providers: {
          oidc: {
            clients: [
              client('a-id', 'Open App', 'two_factor'),
              client('b-id', 'Implicit App'),
            ],
          },
        },
      }

      const notes = buildConfigNotes(config, [])
      expect(notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'open-policy',
            policyName: 'two_factor',
            clientNames: ['Open App'],
          }),
          expect.objectContaining({
            kind: 'open-policy',
            policyName: 'two_factor',
            clientNames: ['Implicit App'],
          }),
        ]),
      )
    })

    it('does not fire for a builtin reference when that builtin name is acknowledged', () => {
      const config = {
        identity_providers: {
          oidc: {
            clients: [
              client('a-id', 'Open App', 'two_factor'),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, ['two_factor'])).toEqual([])
    })
  })

  describe('shared-open-policy', () => {
    it('fires when two clients reference the same acknowledged open policy', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              shared: policy('shared', 'two_factor'),
            },
            clients: [
              client('a-id', 'A', 'shared'),
              client('b-id', 'B', 'shared'),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, ['shared'])).toEqual([
        expect.objectContaining({
          kind: 'shared-open-policy',
          policyName: 'shared',
          clientNames: ['A', 'B'],
        }),
      ])
    })

    it('fires when two clients reference the same unacknowledged open policy, alongside open-policy', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              shared: policy('shared', 'two_factor'),
            },
            clients: [
              client('a-id', 'A', 'shared'),
              client('b-id', 'B', 'shared'),
            ],
          },
        },
      }

      const notes = buildConfigNotes(config, [])
      expect(notes).toEqual([
        expect.objectContaining({
          kind: 'open-policy',
          policyName: 'shared',
          clientNames: ['A', 'B'],
        }),
        expect.objectContaining({
          kind: 'shared-open-policy',
          policyName: 'shared',
          clientNames: ['A', 'B'],
        }),
      ])
    })

    it('does not fire when two clients share a deny-default policy', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              shared: policy('shared', 'deny'),
            },
            clients: [
              client('a-id', 'A', 'shared'),
              client('b-id', 'B', 'shared'),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, [])).toEqual([])
    })
  })

  describe('stale-acknowledgment', () => {
    it('fires for an acknowledged name that is not a policy', () => {
      const notes = buildConfigNotes(baseConfig(), ['tegata', 'tegeta'])
      expect(notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'stale-acknowledgment', policyName: 'tegeta' }),
        ]),
      )
    })

    it('fires for an acknowledged policy whose default has since become deny', () => {
      const config = baseConfig()
      config.identity_providers.oidc.authorization_policies.tegata.default_policy = 'deny'

      const notes = buildConfigNotes(config, ['tegata'])
      expect(notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'stale-acknowledgment', policyName: 'tegata' }),
        ]),
      )
    })

    it('does not fire for an acknowledged builtin that a client still references', () => {
      const config = {
        identity_providers: {
          oidc: {
            clients: [
              client('a-id', 'Open App', 'two_factor'),
            ],
          },
        },
      }

      expect(buildConfigNotes(config, ['two_factor'])).toEqual([])
    })

    it('fires for an acknowledged builtin that no client references', () => {
      const notes = buildConfigNotes({}, ['two_factor'])
      expect(notes).toEqual([
        expect.objectContaining({ kind: 'stale-acknowledgment', policyName: 'two_factor' }),
      ])
    })
  })

  describe('malformed input', () => {
    it('tolerates null, empty, and malformed shapes without throwing', () => {
      expect(buildConfigNotes(null, [])).toEqual([])
      expect(buildConfigNotes({}, [])).toEqual([])
      expect(buildConfigNotes({
        identity_providers: {
          oidc: { authorization_policies: 'nope' },
        },
      }, [])).toEqual([])
      expect(buildConfigNotes({
        identity_providers: {
          oidc: { clients: 42 },
        },
      }, [])).toEqual([])
      expect(buildConfigNotes({
        identity_providers: {
          oidc: {
            clients: ['nope'],
          },
        },
      }, [])).toEqual([])
      expect(buildConfigNotes({
        identity_providers: {
          oidc: {
            authorization_policies: { a: null },
          },
        },
      }, [])).toEqual([])
    })
  })

  describe('output order', () => {
    it('sorts kinds in the documented order for the Chaptarr worked example', () => {
      const notes = buildConfigNotes(chaptarrShapedConfig(), ['tegata', 'grimmory'])
      expect(notes.map(n => n.kind)).toEqual(['shadowed-policy', 'unreferenced-policy', 'shared-open-policy'])
    })

    it('breaks ties by policyName, then by first client name, within a shared kind', () => {
      const config = {
        identity_providers: {
          oidc: {
            authorization_policies: {
              alpha: policy('alpha', 'deny'),
              orphan: policy('orphan', 'deny'),
            },
            clients: [
              client('zephyr-id', 'Zephyr', 'two_factor'),
              client('alpha-id', 'Alpha', 'two_factor'),
            ],
          },
        },
      }

      const notes = buildConfigNotes(config, [])

      // "Alpha" shadows the "alpha" policy (its own slug-matching policy exists but it
      // uses the two_factor builtin instead), leaving both "alpha" and "orphan"
      // unreferenced, and both clients use the open two_factor builtin unacknowledged.
      expect(notes).toEqual([
        expect.objectContaining({
          kind: 'shadowed-policy',
          policyName: 'alpha',
          clientNames: ['Alpha'],
        }),
        expect.objectContaining({ kind: 'unreferenced-policy', policyName: 'alpha', clientNames: [] }),
        expect.objectContaining({ kind: 'unreferenced-policy', policyName: 'orphan', clientNames: [] }),
        expect.objectContaining({
          kind: 'open-policy',
          policyName: 'two_factor',
          clientNames: ['Alpha'],
        }),
        expect.objectContaining({
          kind: 'open-policy',
          policyName: 'two_factor',
          clientNames: ['Zephyr'],
        }),
      ])
    })
  })
})
