import type { ResetToken } from '../types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ResetLinkStatus from './ResetLinkStatus.vue'

function makeToken(overrides: Partial<ResetToken> = {}): ResetToken {
  return {
    id: 'rt-1',
    token: 'tok',
    username: 'alice',
    expires_at: '2099-01-01T00:00:00.000Z',
    used_at: null,
    created_at: '2026-10-31T12:34:56.000Z',
    email_sent_at: null,
    email_error: null,
    ...overrides,
  }
}

function mountStatus(token: ResetToken) {
  return mount(ResetLinkStatus, {
    props: {
      target: 'alice',
      token,
      tokenExpired: false,
      copied: false,
      sending: false,
      error: '',
      loading: false,
    },
  })
}

// The failure reason must be readable without hovering: keyboard, touch and
// most screen-reader users never see hover-only text.
describe('resetLinkStatus email status', () => {
  it('shows the reason an email failed as visible text', () => {
    const wrapper = mountStatus(makeToken({ email_error: 'boom' }))

    expect(wrapper.text()).toContain('boom')
  })
})
