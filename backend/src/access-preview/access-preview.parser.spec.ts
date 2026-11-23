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
        { domain: 'auth.example.com', policy: 'bypass', source: 'everyone' },
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
      expect(previewFor(previews, 'recipes').domains).toEqual([
        { domain: 'auth.example.com', policy: 'bypass', source: 'everyone' },
        { domain: 'recipes.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
    })

    it('should grant a subjectless rule\'s domain to every known group', () => {
      const previews = buildAccessPreviews(config, ['media', 'recipes'])

      for (const group of ['media', 'recipes']) {
        const preview = previewFor(previews, group)
        expect(preview.domains).toContainEqual({ domain: 'auth.example.com', policy: 'bypass', source: 'everyone' })
        expect(preview.notes).toEqual([])
      }
    })
  })

  describe('subjectless grant rules', () => {
    it('should keep the first match when a later group rule names the same domain', () => {
      const config = {
        access_control: {
          default_policy: 'one_factor',
          rules: [
            { domain: 'wiki.example.com', policy: 'one_factor' },
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
      expect(previewFor(previews, 'guests').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should let a subjectless wildcard grant decide its subdomains for a later group rule', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', policy: 'one_factor' },
            { domain: 'app.example.com', subject: 'group:family', policy: 'two_factor' },
            { domain: '{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: '*.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should not grant a subjectless rule\'s domain that an earlier deny decides', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'wiki.example.com', subject: 'group:guests', policy: 'deny' },
            { domain: 'wiki.example.com', policy: 'one_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
      expect(previewFor(previews, 'guests').domains).toEqual([])
    })

    it('should note a narrower subjectless grant that a later broader group grant carves around', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'a.example.com', policy: 'one_factor' },
            { domain: '*.example.com', subject: 'group:family', policy: 'two_factor' },
          ],
        },
      }

      const family = previewFor(buildAccessPreviews(config, ['family']), 'family')

      expect(family.domains).toEqual([
        { domain: 'a.example.com', policy: 'one_factor', source: 'everyone' },
        { domain: '*.example.com', policy: 'two_factor', source: 'group-subject' },
      ])
      expect(family.notes).toEqual([
        '*.example.com is granted except a.example.com, which an earlier rule for everyone decides',
      ])
    })

    it('should not list a subjectless grant for a group an earlier group rule already decided', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'two_factor' },
            { domain: '{group}.example.com', policy: 'two_factor' },
            {
              domain: ['wiki.example.com', 'guests.example.com'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'two_factor', source: 'group-subject' },
        { domain: 'family.example.com', policy: 'two_factor', source: 'group-placeholder' },
        { domain: 'guests.example.com', policy: 'one_factor', source: 'everyone' },
      ])
      expect(previewFor(previews, 'guests').domains).toEqual([
        { domain: 'guests.example.com', policy: 'two_factor', source: 'group-placeholder' },
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should not carve one subjectless rule\'s domains out of each other', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['a.example.com', '*.example.com'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const family = previewFor(buildAccessPreviews(config, ['family']), 'family')

      expect(family.domains).toHaveLength(2)
      expect(family.notes).toEqual([])
    })

    it('should grant a subjectless rule\'s literal domains alongside a domain_regex', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'wiki.example.com', domain_regex: '^x\\.example\\.com$', policy: 'one_factor' },
          ],
        },
      }

      expect(previewFor(buildAccessPreviews(config, ['family']), 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should grant a subjectless rule\'s literal domains listed beside a placeholder domain', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['{group}.example.com', 'wiki.example.com'],
              policy: 'one_factor',
            },
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'family.example.com', policy: 'one_factor', source: 'group-placeholder' },
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
      expect(previewFor(previews, 'guests').domains).toEqual([
        { domain: 'guests.example.com', policy: 'one_factor', source: 'group-placeholder' },
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should grant an empty subject list to every group but skip a subject holding no string', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'wiki.example.com', subject: [], policy: 'one_factor' },
            {
              domain: 'odd.example.com',
              subject: [123],
              policy: 'one_factor',
            },
            {
              domain: '{group}.example.com',
              subject: [123],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'one_factor', source: 'everyone' },
      ])
    })

    it('should skip a subjectless rule with qualifiers or a non-group subject', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'wiki.example.com',
              resources: ['^/api(/.*)?$'],
              policy: 'bypass',
            },
            { domain: 'wiki.example.com', subject: 'user:bob', policy: 'one_factor' },
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'two_factor', source: 'group-subject' },
      ])
      expect(previewFor(previews, 'guests').domains).toEqual([])
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

    it('should let a group-subject wildcard deny decide its subdomains for that group only', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', subject: 'group:guests', policy: 'deny' },
            {
              domain: 'app.example.com',
              subject: [
                'group:guests',
                'group:family',
              ],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'guests').domains).toEqual([])
      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'app.example.com', policy: 'one_factor', source: 'group-subject' },
      ])
    })

    it('should let a subjectless wildcard deny decide its subdomains for every group', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['*.internal.example.com'],
              policy: 'deny',
            },
            { domain: 'db.internal.example.com', subject: 'group:family', policy: 'one_factor' },
            { domain: 'App.Internal.Example.com', subject: 'group:guests', policy: 'one_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([])
      expect(previewFor(previews, 'guests').domains).toEqual([])
    })

    it('should let a wildcard deny decide a later placeholder grant', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', subject: 'group:guests', policy: 'deny' },
            { domain: '{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'guests').domains).toEqual([])
      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'family.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
    })

    it('should not let a wildcard deny decide its apex or an unrelated domain', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', policy: 'deny' },
            {
              domain: [
                'example.com',
                'other.org',
                'notexample.com',
              ],
              subject: 'group:family',
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'example.com', policy: 'one_factor', source: 'group-subject' },
        { domain: 'other.org', policy: 'one_factor', source: 'group-subject' },
        { domain: 'notexample.com', policy: 'one_factor', source: 'group-subject' },
      ])
    })

    it('should let a wildcard deny decide a later wildcard grant it is as broad as', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.example.com', policy: 'deny' },
            {
              domain: [
                '*.example.com',
                '*.app.example.com',
                '*.example.org',
              ],
              subject: 'group:family',
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: '*.example.org', policy: 'one_factor', source: 'group-subject' },
      ])
    })

    it('should keep a broader wildcard grant after a narrower deny and note the carve-out', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'a.example.com', subject: 'group:family', policy: 'deny' },
            { domain: '*.example.com', subject: 'group:family', policy: 'one_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])
      const family = previewFor(previews, 'family')

      expect(family.domains).toEqual([
        { domain: '*.example.com', policy: 'one_factor', source: 'group-subject' },
      ])
      expect(family.notes).toEqual([
        '*.example.com is granted except a.example.com, which an earlier deny rule decides',
      ])
    })

    it('should note a narrower wildcard deny once however many grants it carves out of', () => {
      const config = {
        access_control: {
          rules: [
            { domain: '*.a.example.com', policy: 'deny' },
            { domain: '*.example.com', subject: 'group:family', policy: 'one_factor' },
            { domain: '*.example.com', subject: 'group:family', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').notes).toEqual([
        '*.example.com is granted except *.a.example.com, which an earlier deny rule decides',
      ])
    })

    it('should let a deny with an empty subject decide its domain for every group', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: 'vault.example.com',
              subject: null,
              resources: null,
              policy: 'deny',
            },
            { domain: 'nas.example.com', subject: [], policy: 'deny' },
            {
              domain: 'files.example.com',
              subject: [123],
              policy: 'deny',
            },
            {
              domain: ['vault.example.com', 'nas.example.com', 'files.example.com'],
              subject: ['group:family', 'group:guests'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').domains).toEqual([])
      expect(previewFor(previews, 'guests').domains).toEqual([])
    })

    it('should note a deny whose {group} is past the leading label and still decide its other domains', () => {
      const config = {
        access_control: {
          rules: [
            {
              domain: ['app-{group}.example.com', 'vault.example.com'],
              policy: 'deny',
            },
            {
              domain: ['app-family.example.com', 'vault.example.com'],
              subject: 'group:family',
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'app-family.example.com', policy: 'one_factor', source: 'group-subject' },
      ])
      expect(previewFor(previews, 'family').notes).toHaveLength(1)
      expect(previewFor(previews, 'family').notes[0]).toContain('app-{group}.example.com')
    })

    it('should list only the first policy when two rules grant one group the same domain', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'two_factor' },
            { domain: 'wiki.example.com', subject: 'group:family', policy: 'one_factor' },
            { domain: '{group}.example.com', policy: 'two_factor' },
            { domain: 'family.example.com', subject: 'group:family', policy: 'one_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family'])

      expect(previewFor(previews, 'family').domains).toEqual([
        { domain: 'wiki.example.com', policy: 'two_factor', source: 'group-subject' },
        { domain: 'family.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ])
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

    it('should note a domain with {group} mid-label and grant nothing', () => {
      const config = {
        access_control: {
          rules: [
            { domain: 'app-{group}.example.com', policy: 'two_factor' },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      for (const group of ['family', 'guests']) {
        const preview = previewFor(previews, group)
        expect(preview.domains).toEqual([])
        expect(preview.notes).toHaveLength(1)
        expect(preview.notes[0]).toContain('app-{group}.example.com')
      }
    })

    it('should note a deny that names only a domain_regex for the groups it names', () => {
      const config = {
        access_control: {
          rules: [
            { domain_regex: '^vault\\.example\\.com$', subject: 'group:family', policy: 'deny' },
            {
              domain: 'vault.example.com',
              subject: ['group:family', 'group:guests'],
              policy: 'one_factor',
            },
          ],
        },
      }

      const previews = buildAccessPreviews(config, ['family', 'guests'])

      expect(previewFor(previews, 'family').notes).toHaveLength(1)
      expect(previewFor(previews, 'family').notes[0]).toContain('domain_regex')
      expect(previewFor(previews, 'guests').notes).toEqual([])
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

    function policyConfig(rules: unknown[]) {
      return {
        identity_providers: {
          oidc: {
            authorization_policies: {
              home: { default_policy: 'deny', rules },
            },
            clients: [
              { client_id: 'app', client_name: 'App', authorization_policy: 'home' },
            ],
          },
        },
      }
    }

    it('should grant every group of an OR-list subject without a note', () => {
      const previews = buildAccessPreviews(policyConfig([
        {
          policy: 'one_factor',
          subject: ['group:family', 'group:media'],
        },
      ]), ['family', 'media'])

      for (const group of ['family', 'media']) {
        expect(previewFor(previews, group).oidcClients).toEqual([
          { clientName: 'App', policyName: 'home', policy: 'one_factor' },
        ])
        expect(previewFor(previews, group).notes).toEqual([])
      }
    })

    it('should grant the group of an OR-list that also names a user', () => {
      const previews = buildAccessPreviews(policyConfig([
        {
          policy: 'two_factor',
          subject: ['group:media', 'user:bob'],
        },
      ]), ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([
        { clientName: 'App', policyName: 'home', policy: 'two_factor' },
      ])
      expect(previewFor(previews, 'media').notes).toEqual([])
    })

    it('should let an OR-list decide its groups for later rules', () => {
      const previews = buildAccessPreviews(policyConfig([
        {
          policy: 'two_factor',
          subject: ['group:family', 'group:media'],
        },
        { policy: 'one_factor', subject: 'group:family' },
      ]), ['family', 'media'])

      expect(previewFor(previews, 'family').oidcClients).toEqual([
        { clientName: 'App', policyName: 'home', policy: 'two_factor' },
      ])
    })

    it('should not grant or decide a group through an allow rule scoped to networks', () => {
      const networkConfig = policyConfig([
        {
          policy: 'one_factor',
          subject: 'group:family',
          networks: ['10.0.0.0/8'],
        },
        { policy: 'deny', subject: 'group:family' },
        {
          policy: 'one_factor',
          subject: 'group:media',
          networks: ['10.0.0.0/8'],
        },
        { policy: 'two_factor', subject: 'group:media' },
      ])

      const previews = buildAccessPreviews(networkConfig, ['family', 'media'])

      expect(previewFor(previews, 'family').oidcClients).toEqual([])
      expect(previewFor(previews, 'family').notes).toHaveLength(1)
      expect(previewFor(previews, 'family').notes[0]).toContain('home')
      expect(previewFor(previews, 'media').oidcClients).toEqual([
        { clientName: 'App', policyName: 'home', policy: 'two_factor' },
      ])
      expect(previewFor(previews, 'media').notes).toHaveLength(1)
    })

    it('should surface an inner AND subject as a note only', () => {
      const previews = buildAccessPreviews(policyConfig([
        {
          policy: 'two_factor',
          subject: [
            ['group:media', 'user:bob'],
          ],
        },
      ]), ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([])
      expect(previewFor(previews, 'media').notes).toHaveLength(1)
      expect(previewFor(previews, 'media').notes[0]).toContain('home')
    })

    it('should not note a later unparsed rule for a group an earlier rule decided', () => {
      const previews = buildAccessPreviews(policyConfig([
        { policy: 'one_factor', subject: 'group:media' },
        {
          policy: 'two_factor',
          subject: 'group:media',
          networks: ['10.0.0.0/8'],
        },
        {
          policy: 'two_factor',
          subject: [
            ['group:media', 'user:bob'],
          ],
        },
      ]), ['media'])

      expect(previewFor(previews, 'media').oidcClients).toEqual([
        { clientName: 'App', policyName: 'home', policy: 'one_factor' },
      ])
      expect(previewFor(previews, 'media').notes).toEqual([])
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
