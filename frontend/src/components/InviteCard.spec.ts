import type { Invite } from '../types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InviteCard from './InviteCard.vue'

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
    const emailed = wrapper.find('.invite-email-sent').attributes('title')?.replace(/^Emailed /, '')

    expect(created).toBe(emailed)
    expect(created).toContain('01:34 PM')
  })
})
