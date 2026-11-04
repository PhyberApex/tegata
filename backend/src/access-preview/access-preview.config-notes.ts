import type { ConfigNote, ConfigNoteKind } from './access-preview.types'
import { flattenSubjects, resolveClientName } from './access-preview.parser'

const BUILTIN_POLICIES = ['one_factor', 'two_factor'] as const
// Authelia defaults both an OIDC client's authorization_policy and an
// authorization_policies.<name>.default_policy to two_factor when unset.
const DEFAULT_POLICY_NAME = 'two_factor'

const KIND_ORDER: ConfigNoteKind[] = [
  'shadowed-policy',
  'unreferenced-policy',
  'open-policy',
  'shared-open-policy',
  'stale-acknowledgment',
]

interface PolicyReference {
  clientName: string
  policyName: string
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function isBuiltinPolicyName(name: string): boolean {
  return (BUILTIN_POLICIES as readonly string[]).includes(name)
}

function namedPolicies(config: Record<string, any>): Record<string, any> {
  const raw = config.identity_providers?.oidc?.authorization_policies
  if (!isPlainObject(raw))
    return {}

  const policies: Record<string, any> = {}
  for (const [name, def] of Object.entries(raw)) {
    if (isPlainObject(def))
      policies[name] = def
  }
  return policies
}

function validClients(config: Record<string, any>): Record<string, any>[] {
  const raw = config.identity_providers?.oidc?.clients
  return Array.isArray(raw)
    ? raw.filter(isPlainObject)
    : []
}

function clientPolicyName(client: Record<string, any>): string {
  return typeof client.authorization_policy === 'string'
    ? client.authorization_policy
    : DEFAULT_POLICY_NAME
}

function collectReferences(clients: Record<string, any>[]): PolicyReference[] {
  return clients.map(client => ({
    clientName: resolveClientName(client),
    policyName: clientPolicyName(client),
  }))
}

function hasOpenRule(rules: unknown): boolean {
  if (!Array.isArray(rules))
    return false

  return rules.some((rule) => {
    if (!isPlainObject(rule))
      return false
    const policy = typeof rule.policy === 'string'
      ? rule.policy
      : 'unknown'
    return policy !== 'deny' && flattenSubjects(rule.subject).length === 0
  })
}

function isOpenPolicyDef(policyDef: Record<string, any>): boolean {
  const defaultPolicy = typeof policyDef.default_policy === 'string'
    ? policyDef.default_policy
    : DEFAULT_POLICY_NAME
  return defaultPolicy !== 'deny' || hasOpenRule(policyDef.rules)
}

function groupByPolicy(references: PolicyReference[]): Map<string, string[]> {
  const byPolicy = new Map<string, string[]>()
  for (const ref of references) {
    const list = byPolicy.get(ref.policyName) ?? []
    list.push(ref.clientName)
    byPolicy.set(ref.policyName, list)
  }
  return byPolicy
}

function buildShadowedPolicyNotes(policies: Record<string, any>, references: PolicyReference[]): ConfigNote[] {
  const slugToPolicyNames = new Map<string, string[]>()
  for (const name of Object.keys(policies)) {
    const slug = slugify(name)
    const list = slugToPolicyNames.get(slug) ?? []
    list.push(name)
    slugToPolicyNames.set(slug, list)
  }

  const shadowedBy = new Map<string, Set<string>>()
  for (const ref of references) {
    const candidates = slugToPolicyNames.get(slugify(ref.clientName)) ?? []
    for (const candidate of candidates) {
      if (candidate === ref.policyName)
        continue
      const clients = shadowedBy.get(candidate) ?? new Set<string>()
      clients.add(ref.clientName)
      shadowedBy.set(candidate, clients)
    }
  }

  return [
    ...shadowedBy.entries(),
  ].map(([policyName, clientSet]): ConfigNote => {
    const clientNames = [...clientSet].sort()
    const pronoun = clientNames.length === 1
      ? 'it points'
      : 'they point'
    return {
      kind: 'shadowed-policy',
      policyName,
      clientNames,
      message: `Policy "${policyName}" is named after ${clientNames.join(', ')}, but ${pronoun} at a different authorization policy instead.`,
    }
  })
}

function buildUnreferencedPolicyNotes(policies: Record<string, any>, references: PolicyReference[]): ConfigNote[] {
  const referenced = new Set(references.map(ref => ref.policyName))
  return Object.keys(policies)
    .filter(name => !referenced.has(name))
    .map((policyName): ConfigNote => ({
      kind: 'unreferenced-policy',
      policyName,
      clientNames: [],
      message: `Policy "${policyName}" is not referenced by any OIDC client.`,
    }))
}

function buildNamedOpenPolicyNotes(policies: Record<string, any>, referencesByPolicy: Map<string, string[]>, acknowledged: Set<string>): ConfigNote[] {
  const notes: ConfigNote[] = []

  for (const [policyName, def] of Object.entries(policies)) {
    if (acknowledged.has(policyName))
      continue
    const clientNames = referencesByPolicy.get(policyName) ?? []
    if (clientNames.length === 0 || !isOpenPolicyDef(def))
      continue
    const sorted = [...clientNames].sort()
    notes.push({
      kind: 'open-policy',
      policyName,
      clientNames: sorted,
      message: `Policy "${policyName}" is open by default and used by ${sorted.join(', ')}, but is not acknowledged as intentionally open.`,
    })
  }

  return notes
}

function buildBuiltinOpenPolicyNotes(referencesByPolicy: Map<string, string[]>, acknowledged: Set<string>): ConfigNote[] {
  const notes: ConfigNote[] = []

  for (const builtin of BUILTIN_POLICIES) {
    if (acknowledged.has(builtin))
      continue
    for (const clientName of [
      ...(referencesByPolicy.get(builtin) ?? []),
    ].sort()) {
      notes.push({
        kind: 'open-policy',
        policyName: builtin,
        clientNames: [clientName],
        message: `${clientName} uses the builtin "${builtin}" policy, which admits any authenticated user.`,
      })
    }
  }

  return notes
}

function buildOpenPolicyNotes(policies: Record<string, any>, references: PolicyReference[], acknowledged: Set<string>): ConfigNote[] {
  const referencesByPolicy = groupByPolicy(references)
  return [
    ...buildNamedOpenPolicyNotes(policies, referencesByPolicy, acknowledged),
    ...buildBuiltinOpenPolicyNotes(referencesByPolicy, acknowledged),
  ]
}

function buildSharedOpenPolicyNotes(policies: Record<string, any>, references: PolicyReference[]): ConfigNote[] {
  const referencesByPolicy = groupByPolicy(references.filter(ref => Object.hasOwn(policies, ref.policyName)))

  const notes: ConfigNote[] = []
  for (const [policyName, clientNames] of referencesByPolicy) {
    if (clientNames.length < 2)
      continue
    if (!isOpenPolicyDef(policies[policyName]))
      continue
    const sorted = [...clientNames].sort()
    notes.push({
      kind: 'shared-open-policy',
      policyName,
      clientNames: sorted,
      message: `Policy "${policyName}" is open and shared by multiple clients: ${sorted.join(', ')}.`,
    })
  }
  return notes
}

function buildStaleAcknowledgmentNotes(policies: Record<string, any>, references: PolicyReference[], acknowledged: string[]): ConfigNote[] {
  const referencedPolicyNames = new Set(references.map(ref => ref.policyName))
  const notes: ConfigNote[] = []

  for (const policyName of new Set(acknowledged)) {
    if (isBuiltinPolicyName(policyName)) {
      if (!referencedPolicyNames.has(policyName)) {
        notes.push({
          kind: 'stale-acknowledgment',
          policyName,
          clientNames: [],
          message: `Acknowledged policy "${policyName}" is a builtin policy that no client references.`,
        })
      }
      continue
    }

    const def = policies[policyName]
    if (def === undefined) {
      notes.push({
        kind: 'stale-acknowledgment',
        policyName,
        clientNames: [],
        message: `Acknowledged policy "${policyName}" does not exist in the Authelia configuration.`,
      })
      continue
    }

    if (!isOpenPolicyDef(def)) {
      notes.push({
        kind: 'stale-acknowledgment',
        policyName,
        clientNames: [],
        message: `Acknowledged policy "${policyName}" is no longer open by default.`,
      })
    }
  }

  return notes
}

function sortNotes(notes: ConfigNote[]): ConfigNote[] {
  return [...notes].sort((a, b) => {
    const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (kindDiff !== 0)
      return kindDiff
    const policyDiff = a.policyName.localeCompare(b.policyName)
    if (policyDiff !== 0)
      return policyDiff
    return (a.clientNames[0] ?? '').localeCompare(b.clientNames[0] ?? '')
  })
}

export function buildConfigNotes(config: unknown, acknowledgedOpenPolicies: string[]): ConfigNote[] {
  const cfg = isPlainObject(config)
    ? config
    : {}
  const policies = namedPolicies(cfg)
  const references = collectReferences(validClients(cfg))
  const acknowledged = new Set(acknowledgedOpenPolicies)

  const notes = [
    ...buildShadowedPolicyNotes(policies, references),
    ...buildUnreferencedPolicyNotes(policies, references),
    ...buildOpenPolicyNotes(policies, references, acknowledged),
    ...buildSharedOpenPolicyNotes(policies, references),
    ...buildStaleAcknowledgmentNotes(policies, references, acknowledgedOpenPolicies),
  ]

  return sortNotes(notes)
}
