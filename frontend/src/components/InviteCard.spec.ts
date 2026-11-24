import type { Invite } from '../types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InviteCard from './InviteCard.vue'
import inviteCardSource from './InviteCard.vue?raw'

function makeInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'inv-1',
    token: 'tok',
    groups: ['users'],
    expires_at: '2099-01-01T00:00:00.000Z',
    email: 'alice@example.com',
    displayname: null,
    used_by: null,
    used_at: null,
    created_at: '2026-10-31T12:34:56.000Z',
    bundle_name: null,
    email_sent_at: '2026-10-31T12:34:56.000Z',
    email_error: null,
    ...overrides,
  }
}

describe('inviteCard timestamps', () => {
  beforeEach(() => {
    // Outside UTC, a timestamp without its zone marker would render an hour off from one with it.
    vi.stubEnv('TZ', 'Europe/Berlin')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders Created and Emailed with the same offset when they are the same instant', () => {
    const wrapper = mount(InviteCard, {
      props: {
        invite: makeInvite(),
        variant: 'active',
        copiedId: null,
        sendingId: null,
      },
    })

    const created = wrapper.find('.invite-created').text().replace(/^Created /, '')
    const emailed = wrapper.find('.invite-email-sent').text().replace(/^✓ Emailed /, '')

    expect(created).toBe(emailed)
    expect(created).toContain('01:34 PM')
  })
})

// A title attribute is hover-only, so keyboard, touch and most screen-reader users would never learn why sending failed.
describe('inviteCard email status', () => {
  it('shows the reason an email failed as visible text', () => {
    const wrapper = mount(InviteCard, {
      props: {
        invite: makeInvite({ email_sent_at: null, email_error: 'boom' }),
        variant: 'active',
        copiedId: null,
        sendingId: null,
      },
    })

    expect(wrapper.text()).toContain('boom')
  })
})

// Card-level opacity dims the enabled Remove button and the meta text below WCAG 4.5:1.
describe('inviteCard dimmed variants', () => {
  const style = inviteCardSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]!.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [
    ...style.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .map(([, selector, body]) => ({
      selector: selector!.trim(),
      body: body!,
    }))

  it.each(['used', 'expired'] as const)('the %s variant applies no opacity to the actions container or its ancestors', (variant) => {
    const wrapper = mount(InviteCard, {
      props: {
        invite: makeInvite({ used_by: 'bob', used_at: '2026-11-01T00:00:00.000Z' }),
        variant,
        copiedId: null,
        sendingId: null,
      },
    })

    const classes = new Set(wrapper.classes())
    const actions = wrapper.find('.invite-actions')
    if (actions.exists())
      actions.classes().forEach(c => classes.add(c))
    expect(classes).toContain(`invite-card--${variant}`)

    const applying = rules.filter(({ selector }) => selector.split(',').some((s) => {
      const selectorClasses = [
        ...s.matchAll(/\.([\w-]+)/g),
      ].map(m => m[1]!)
      return selectorClasses.length > 0 && selectorClasses.every(c => classes.has(c))
    }))
    expect(applying.flatMap(r => r.selector.split(',').map(s => s.trim()))).toContain(`.invite-card--${variant}`)
    for (const rule of applying)
      expect(rule.body, rule.selector).not.toMatch(/opacity/)
  })
})
