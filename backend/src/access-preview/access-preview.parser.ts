import type { GroupAccessPreview } from './access-preview.types'

const GROUP_PLACEHOLDER = '{group}'
const GROUP_SUBJECT_PREFIX = 'group:'
const RULE_QUALIFIERS = [
  'resources',
  'networks',
  'methods',
  'query',
] as const

interface AccessRule {
  domain?: unknown
  domain_regex?: unknown
  policy?: unknown
  subject?: unknown
  resources?: unknown
  networks?: unknown
  methods?: unknown
  query?: unknown
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string')
    return [value]
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string')
  return []
}

export function flattenSubjects(subject: unknown): string[] {
  if (typeof subject === 'string')
    return [subject]
  if (Array.isArray(subject))
    return subject.flatMap(flattenSubjects)
  return []
}

function subjectGroups(subjects: string[]): string[] {
  return subjects
    .filter(s => s.startsWith(GROUP_SUBJECT_PREFIX))
    .map(s => s.slice(GROUP_SUBJECT_PREFIX.length))
}

function ruleQualifiers(rule: AccessRule): string[] {
  return RULE_QUALIFIERS.filter(key => rule[key] !== undefined)
}

function isSingleGroupSubject(subjects: string[], groups: string[]): boolean {
  return subjects.length === 1 && groups.length === 1
}

// a subject list is OR over its entries and an inner list is AND over its own,
// so a rule matches every member of a group only through an entry that is that
// group alone — `[['group:a', 'group:b']]` matches neither group as a whole
function wholeSubjectGroups(subject: unknown): string[] {
  const entries = Array.isArray(subject)
    ? subject
    : [subject]
  return entries.flatMap((entry) => {
    const subjects = flattenSubjects(entry)
    const groups = subjectGroups(subjects)
    return isSingleGroupSubject(subjects, groups)
      ? groups
      : []
  })
}

function describeRule(rule: AccessRule): string {
  return JSON.stringify(rule)
}

type PreviewFor = (group: string) => GroupAccessPreview

const EVERYONE = '\u0000everyone'

// Authelia's rules are first-match, so once a deny has decided a group's
// request for a domain no later rule is consulted for it
class DeniedDomains {
  private readonly keys = new Set<string>()

  constructor(private readonly knownGroups: string[]) {}

  private static key(group: string, domain: string): string {
    return `${group}\u0000${domain.toLowerCase()}`
  }

  // groups undefined means the deny names no subject and so matches everyone
  deny(domain: string, groups: string[] | undefined): void {
    if (domain.includes(GROUP_PLACEHOLDER)) {
      for (const group of groups ?? this.knownGroups)
        this.keys.add(DeniedDomains.key(group, domain.replaceAll(GROUP_PLACEHOLDER, group)))
      return
    }
    for (const group of groups ?? [EVERYONE])
      this.keys.add(DeniedDomains.key(group, domain))
  }

  allows(group: string, domain: string): boolean {
    return !this.keys.has(DeniedDomains.key(EVERYONE, domain))
      && !this.keys.has(DeniedDomains.key(group, domain))
  }
}

interface RuleAttributes {
  domains: string[]
  subjects: string[]
  groups: string[]
  policy: string
  qualifiers: string[]
  placeholderDomains: string[]
}

type RuleClassification
  = | { kind: 'skip' }
    | { kind: 'deny', domains: string[], groups: string[] | undefined }
    | { kind: 'placeholder', domains: string[], policy: string }
    | { kind: 'modeled', domains: string[], groups: string[], policy: string }
    | { kind: 'unparsed', groups: string[] }

function parseRuleAttributes(rule: AccessRule): RuleAttributes {
  const domains = asStringArray(rule.domain)
  const subjects = flattenSubjects(rule.subject)
  const groups = subjectGroups(subjects)
  return {
    domains,
    subjects,
    groups,
    policy: typeof rule.policy === 'string'
      ? rule.policy
      : 'unknown',
    qualifiers: ruleQualifiers(rule),
    placeholderDomains: domains.filter(d => d.includes(GROUP_PLACEHOLDER)),
  }
}

// a deny never unlocks anything, but one that matches every request to its
// domains decides them for every later rule; a qualified one decides nothing.
// domain_regex is OR'd with domain, so the literal domains still decide — the
// regex itself isn't modeled
function matchDeny(rule: AccessRule, attrs: RuleAttributes): RuleClassification | undefined {
  if (attrs.policy !== 'deny')
    return undefined
  if (attrs.qualifiers.length > 0)
    return { kind: 'skip' }
  const groups = rule.subject === undefined
    ? undefined
    : wholeSubjectGroups(rule.subject)
  return { kind: 'deny', domains: attrs.domains, groups }
}

function matchPlaceholder(attrs: RuleAttributes): RuleClassification | undefined {
  if (attrs.placeholderDomains.length === 0 || attrs.subjects.length > 0 || attrs.qualifiers.length > 0)
    return undefined
  return { kind: 'placeholder', domains: attrs.placeholderDomains, policy: attrs.policy }
}

function matchNoGroupSkip(attrs: RuleAttributes): RuleClassification | undefined {
  return attrs.groups.length === 0 && attrs.placeholderDomains.length === 0
    ? { kind: 'skip' }
    : undefined
}

function matchModeled(rule: AccessRule, attrs: RuleAttributes): RuleClassification | undefined {
  const groups = [
    ...new Set(wholeSubjectGroups(rule.subject)),
  ]
  const modeled = attrs.placeholderDomains.length === 0
    && groups.length > 0
    && attrs.qualifiers.length === 0
    && rule.domain_regex === undefined
    && attrs.domains.length > 0

  return modeled
    ? {
        kind: 'modeled',
        domains: attrs.domains,
        groups,
        policy: attrs.policy,
      }
    : undefined
}

function matchUnparsed(attrs: RuleAttributes, knownGroups: string[]): RuleClassification {
  const affected = attrs.placeholderDomains.length > 0
    ? knownGroups
    : attrs.groups
  return {
    kind: 'unparsed',
    groups: [
      ...new Set(affected),
    ],
  }
}

// mirrors access-preview.parser.spec.ts's describe blocks one-for-one, in the same precedence order
function classifyAccessRule(rule: AccessRule, knownGroups: string[]): RuleClassification {
  const attrs = parseRuleAttributes(rule)
  return matchDeny(rule, attrs)
    ?? matchPlaceholder(attrs)
    ?? matchNoGroupSkip(attrs)
    ?? matchModeled(rule, attrs)
    ?? matchUnparsed(attrs, knownGroups)
}

function applyDeny(domains: string[], groups: string[] | undefined, denied: DeniedDomains): void {
  for (const domain of domains)
    denied.deny(domain, groups)
}

function applyPlaceholderGrants(domains: string[], policy: string, knownGroups: string[], denied: DeniedDomains, previewFor: PreviewFor): void {
  for (const group of knownGroups) {
    for (const domain of domains.map(d => d.replaceAll(GROUP_PLACEHOLDER, group))) {
      if (denied.allows(group, domain))
        previewFor(group).domains.push({ domain, policy, source: 'group-placeholder' })
    }
  }
}

function applyModeledGrant(domains: string[], groups: string[], policy: string, denied: DeniedDomains, previewFor: PreviewFor): void {
  for (const group of groups) {
    for (const domain of domains.filter(d => denied.allows(group, d)))
      previewFor(group).domains.push({ domain, policy, source: 'group-subject' })
  }
}

function applyUnparsedRuleNotes(groups: string[], rule: AccessRule, previewFor: PreviewFor): void {
  for (const group of groups)
    previewFor(group).notes.push(`Unparsed access rule referencing this group: ${describeRule(rule)}`)
}

function collectAccessRuleGrants(rules: AccessRule[], knownGroups: string[], previewFor: PreviewFor): void {
  const denied = new DeniedDomains(knownGroups)
  for (const rule of rules) {
    const classification = classifyAccessRule(rule, knownGroups)
    switch (classification.kind) {
      case 'skip':
        continue
      case 'deny':
        applyDeny(classification.domains, classification.groups, denied)
        continue
      case 'placeholder':
        applyPlaceholderGrants(classification.domains, classification.policy, knownGroups, denied, previewFor)
        continue
      case 'modeled':
        applyModeledGrant(classification.domains, classification.groups, classification.policy, denied, previewFor)
        continue
      case 'unparsed':
        applyUnparsedRuleNotes(classification.groups, rule, previewFor)
    }
  }
}

// first-match like access_control: a group an earlier rule matched as a whole —
// deny or grant — is decided, and no later rule in the policy is consulted for it
function decidePolicyRule(rule: any, rulePolicy: string, decided: Set<string>, policyGrants: Map<string, string>): void {
  for (const group of wholeSubjectGroups(rule?.subject).filter(g => !decided.has(g))) {
    decided.add(group)
    if (rulePolicy !== 'deny')
      policyGrants.set(group, rulePolicy)
  }
}

function collectPolicyRuleGrants(policyRules: any[], policyName: string, previewFor: PreviewFor): Map<string, string> {
  const policyGrants = new Map<string, string>()
  const decided = new Set<string>()

  for (const rule of policyRules) {
    const rulePolicy = typeof rule?.policy === 'string'
      ? rule.policy
      : 'unknown'
    // a deny scoped to some networks still lets every other request through
    if (rulePolicy === 'deny') {
      if (rule?.networks === undefined)
        decidePolicyRule(rule, rulePolicy, decided, policyGrants)
      continue
    }
    const subjects = flattenSubjects(rule?.subject)
    const groups = subjectGroups(subjects)
    if (isSingleGroupSubject(subjects, groups)) {
      decidePolicyRule(rule, rulePolicy, decided, policyGrants)
      continue
    }
    for (const group of new Set(groups))
      previewFor(group).notes.push(`Unparsed rule in OIDC policy "${policyName}": ${describeRule(rule)}`)
  }

  return policyGrants
}

function collectOidcPolicyGrants(policies: Record<string, any>, previewFor: PreviewFor): Map<string, Map<string, string>> {
  const grantsByPolicy = new Map<string, Map<string, string>>()

  for (const [policyName, policyDef] of Object.entries(policies)) {
    const policyRules: any[] = Array.isArray(policyDef?.rules)
      ? policyDef.rules
      : []
    grantsByPolicy.set(policyName, collectPolicyRuleGrants(policyRules, policyName, previewFor))
  }

  return grantsByPolicy
}

export function resolveClientName(client: any): string {
  return typeof client?.client_name === 'string' && client.client_name.length > 0
    ? client.client_name
    : String(client?.client_id ?? 'unnamed client')
}

function applyClientGrants(client: any, grantsByPolicy: Map<string, Map<string, string>>, previewFor: PreviewFor): void {
  const policyName = client?.authorization_policy
  const policyGrants = typeof policyName === 'string'
    ? grantsByPolicy.get(policyName)
    : undefined
  if (!policyGrants)
    return
  const clientName = resolveClientName(client)
  for (const [group, policy] of policyGrants)
    previewFor(group).oidcClients.push({ clientName, policyName, policy })
}

function collectOidcClientGrants(clients: any[], grantsByPolicy: Map<string, Map<string, string>>, previewFor: PreviewFor): void {
  for (const client of clients)
    applyClientGrants(client, grantsByPolicy, previewFor)
}

export function buildAccessPreviews(config: unknown, knownGroups: string[]): GroupAccessPreview[] {
  const cfg = (config ?? {}) as Record<string, any>

  const previews = new Map<string, GroupAccessPreview>()
  const previewFor: PreviewFor = (group) => {
    let preview = previews.get(group)
    if (!preview) {
      preview = {
        group,
        domains: [],
        oidcClients: [],
        notes: [],
      }
      previews.set(group, preview)
    }
    return preview
  }

  for (const group of knownGroups)
    previewFor(group)

  const rules: AccessRule[] = Array.isArray(cfg.access_control?.rules)
    ? cfg.access_control.rules.filter((r: unknown) => typeof r === 'object' && r !== null)
    : []
  collectAccessRuleGrants(rules, knownGroups, previewFor)

  const oidc = cfg.identity_providers?.oidc
  const policies: Record<string, any> = typeof oidc?.authorization_policies === 'object' && oidc.authorization_policies !== null
    ? oidc.authorization_policies
    : {}
  const grantsByPolicy = collectOidcPolicyGrants(policies, previewFor)

  const clients: any[] = Array.isArray(oidc?.clients)
    ? oidc.clients
    : []
  collectOidcClientGrants(clients, grantsByPolicy, previewFor)

  return [
    ...previews.values(),
  ].sort((a, b) => a.group.localeCompare(b.group))
}
