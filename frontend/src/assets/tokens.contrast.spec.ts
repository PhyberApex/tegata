import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'

type Rgba = [number, number, number, number]

const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')

function declarationsOf(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(',').map(s => s.trim())
    if (!selectors.includes(selector))
      continue
    for (const declaration of match[2]!.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1)
        continue
      declarations[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim()
    }
  }
  return declarations
}

const rootVars = declarationsOf(':root')

function resolve(value: string): string {
  const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const token = rootVars[name]
    if (token === undefined)
      throw new Error(`Undefined token ${name}`)
    return resolve(token)
  })
  return resolved
}

function parseColor(value: string): Rgba {
  const v = resolve(value).trim()
  if (v === '#fff' || v === '#ffffff')
    return [255, 255, 255, 1]
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex)
    return [0, 2, 4].map(i => Number.parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as Rgba
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(v)
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      Number(rgba[4]),
    ]
  }
  throw new Error(`Unparseable colour ${value}`)
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [
    r * a + br * (1 - a),
    g * a + bg * (1 - a),
    b * a + bb * (1 - a),
    1,
  ]
}

function luminance([r, g, b]: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.04045
      ? s / 12.92
      : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(fg: string, bg: string, page = '--tg-bg-base'): number {
  const backdrop = parseColor(`var(${page})`)
  const background = over(parseColor(bg), backdrop)
  const foreground = over(parseColor(fg), background)
  const [hi, lo] = [
    luminance(foreground),
    luminance(background),
  ].sort((a, b) => b - a)
  return (hi! + 0.05) / (lo! + 0.05)
}

const surfaces = ['--tg-bg-base', '--tg-bg-raised', '--tg-bg-overlay'] as const

describe('colour token contrast (WCAG 2.2)', () => {
  it('reads the CSS it measures', () => {
    expect(contrast('#ffffff', '#0ea5e9')).toBeCloseTo(2.77, 2)
  })

  it('primary button text passes 4.5:1, at rest and on hover', () => {
    const rest = declarationsOf('.tg-btn-primary')
    const hover = {
      ...rest,
      ...declarationsOf('.tg-btn-primary:hover'),
    }
    expect(contrast(rest.color!, rest.background!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hover.color!, hover.background!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(surfaces)('danger button text passes 4.5:1 on %s, at rest and on hover', (surface) => {
    const rest = declarationsOf('.tg-btn-danger')
    const hover = {
      ...rest,
      ...declarationsOf('.tg-btn-danger:hover'),
    }
    expect(contrast(rest.color!, rest.background!, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hover.color!, hover.background!, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(surfaces)('danger text and badges pass 4.5:1 on %s', (surface) => {
    expect(contrast(declarationsOf('.tg-error').color!, `var(${surface})`)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(declarationsOf('.tg-form-error').color!, `var(${surface})`)).toBeGreaterThanOrEqual(4.5)
    const badge = declarationsOf('.tg-badge-danger')
    expect(contrast(badge.color!, badge.background!, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(surfaces)('muted text and table headers pass 4.5:1 on %s', (surface) => {
    expect(contrast('var(--tg-text-muted)', `var(${surface})`)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(declarationsOf('.tg-table th').color!, `var(${surface})`)).toBeGreaterThanOrEqual(4.5)
  })

  it('danger text passes 4.5:1 on the warning-tinted banner', () => {
    expect(contrast('var(--tg-danger-text)', 'var(--tg-warning-muted)')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--tg-bg-input', ...surfaces])('input border passes 3:1 against %s', (surface) => {
    const border = declarationsOf('.tg-input').border!.split(' ').slice(2).join(' ')
    expect(contrast(border, `var(${surface})`)).toBeGreaterThanOrEqual(3)
  })
})
