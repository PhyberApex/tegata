import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EffectiveAccessPanel from './EffectiveAccessPanel.vue'

describe('effectiveAccessPanel', () => {
  it('labels a domain granted to everyone, and only that one', () => {
    const wrapper = mount(EffectiveAccessPanel, {
      props: {
        result: {
          available: true,
          domains: [
            {
              group: 'family',
              domain: 'wiki.example.com',
              policy: 'one_factor',
              source: 'everyone',
            },
            {
              group: 'family',
              domain: 'family.example.com',
              policy: 'two_factor',
              source: 'group-placeholder',
            },
          ],
          oidcClients: [],
          notes: [],
        },
      },
    })

    const items = wrapper.findAll('.tg-access-item')
    expect(items[0]!.find('.tg-access-item-scope').text()).toBe('everyone')
    expect(items[1]!.find('.tg-access-item-scope').exists()).toBe(false)
  })
})
