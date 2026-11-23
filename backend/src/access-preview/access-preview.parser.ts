import type { GroupAccessPreview } from './access-preview.types'

const GROUP_PLACEHOLDER = '{group}'
const GROUP_PLACEHOLDER_LABEL = `${GROUP_PLACEHOLDER}.`
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

// YAML reads a key left empty (`resources:`) as null, which Authelia treats as unset
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null
}

function ruleQualifiers(rule: AccessRule): string[] {
  return RULE_QUALIFIERS.filter(key => isSet(rule[key]))
}

// Authelia documents {group} only as the leading label (`{group}.example.com`);
// anywhere else it isn't substituted the way this preview could model
function isLeadingPlaceholder(domain: string): boolean {
  return domain.startsWith(GROUP_PLACEHOLDER_LABEL)
    && !domain.slice(GROUP_PLACEHOLDER.length).includes(GROUP_PLACEHOLDER)
}

function substituteLeadingPlaceholder(domain: string, group: string): string {
  return group + domain.slice(GROUP_PLACEHOLDER.length)
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

const WILDCARD = '*'
const WILDCARD_PREFIX = `${WILDCARD}.`

// Authelia matches a domain exactly (case-insensitive), or — for a pattern with
// a leading `*.` — any subdomain of the rest. Either side may be a wildcard, so
// this answers whether every request `inner` matches is also matched by `outer`
function domainCovers(outer: string, inner: string): boolean {
  if (outer === inner)
    return true
  // keep the dot, so `*.example.com` doesn't reach the apex or `notexample.com`
  const subdomainSuffix = outer.slice(WILDCARD.length)
  return outer.startsWith(WILDCARD_PREFIX) && inner.endsWith(subdomainSuffix)
}

// what decided a domain first: a deny, or a grant to every group
type DecidedBy = 'deny' | 'everyone'

const DECIDER_PHRASES: Record<DecidedBy, string> = {
  deny: 'an earlier deny rule',
  everyone: 'an earlier rule for everyone',
}

interface CarveOut {
  pattern: string
  by: DecidedBy
}

type DecidedEntry = CarveOut & { group: string }

interface GrantDecision {
  allowed: boolean
  // earlier decisions the grant's wildcard is broader than: they still decide
  // their own domains, so the grant reaches everything but those
  carvedOut: CarveOut[]
}

// Authelia's rules are first-match, so once a deny — or a grant matching every
// group — has decided a group's request for a domain no later rule is consulted for it
class DecidedDomains {
  private readonly entries: DecidedEntry[] = []

  constructor(private readonly knownGroups: string[]) {}

  // groups undefined means the deny names no subject and so matches everyone
  deny(domain: string, groups: string[] | undefined): void {
    if (isLeadingPlaceholder(domain)) {
      for (const group of groups ?? this.knownGroups)
        this.record(group, substituteLeadingPlaceholder(domain, group), 'deny')
      return
    }
    for (const group of groups ?? [EVERYONE])
      this.record(group, domain, 'deny')
  }

  // a subjectless grant has matched every group's request for its literal domain
  grantEveryone(domain: string): void {
    this.record(EVERYONE, domain, 'everyone')
  }

  private record(group: string, domain: string, by: DecidedBy): void {
    this.entries.push({
      group,
      pattern: domain.toLowerCase(),
      by,
    })
  }

  decideGrant(group: string, domain: string): GrantDecision {
    const target = domain.toLowerCase()
    const applicable = this.entries.filter(e => e.group === EVERYONE || e.group === group)
    if (applicable.some(e => domainCovers(e.pattern, target)))
      return { allowed: false, carvedOut: [] }
    const carvedOut = new Map<string, DecidedBy>()
    for (const e of applicable.filter(e => domainCovers(target, e.pattern))) {
      if (!carvedOut.has(e.pattern))
        carvedOut.set(e.pattern, e.by)
    }
    return {
      allowed: true,
      carvedOut: [...carvedOut].map(([pattern, by]) => ({ pattern, by })),
    }
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
    | { kind: 'deny', domains: string[], groups: string[] | undefined, notedGroups: string[] }
    | { kind: 'placeholder', domains: string[], literalDomains: string[], policy: string }
    | { kind: 'everyone', domains: string[], policy: string }
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
// regex itself isn't modeled, so a deny that decides only through a regex, or
// through a {group} this preview can't substitute, is noted for its groups
function matchDeny(rule: AccessRule, attrs: RuleAttributes, knownGroups: string[]): RuleClassification | undefined {
  if (attrs.policy !== 'deny')
    return undefined
  if (attrs.qualifiers.length > 0)
    return { kind: 'skip' }
  // an empty, null or non-string subject names nobody, so the deny matches everyone
  const subjectless = attrs.subjects.length === 0
  const domains = attrs.domains.filter(d => !d.includes(GROUP_PLACEHOLDER) || isLeadingPlaceholder(d))
  const unmodeled = domains.length < attrs.domains.length
    || (attrs.domains.length === 0 && isSet(rule.domain_regex))
  const notedGroups = !unmodeled
    ? []
    : subjectless
      ? knownGroups
      : [
          ...new Set(attrs.groups),
        ]
  const groups = subjectless
    ? undefined
    : wholeSubjectGroups(rule.subject)
  return {
    kind: 'deny',
    domains,
    groups,
    notedGroups,
  }
}

// a subject that is present but holds no string is a typo rather than
// everyone, so only an absent or empty one grants every group
function isAbsentSubject(subject: unknown): boolean {
  return !isSet(subject) || (Array.isArray(subject) && subject.length === 0)
}

function matchPlaceholder(rule: AccessRule, attrs: RuleAttributes): RuleClassification | undefined {
  if (attrs.placeholderDomains.length === 0 || !isAbsentSubject(rule.subject) || attrs.qualifiers.length > 0)
    return undefined
  // a {group} past the leading label falls through to an unparsed note
  if (!attrs.placeholderDomains.every(isLeadingPlaceholder))
    return undefined
  // a plain domain listed beside a {group} one is matched for every group, like a rule for everyone
  return {
    kind: 'placeholder',
    domains: attrs.placeholderDomains,
    literalDomains: attrs.domains.filter(d => !d.includes(GROUP_PLACEHOLDER)),
    policy: attrs.policy,
  }
}

// a rule naming no subject and no qualifier matches every group's request to its
// literal domains, so like a subjectless deny it decides them for everyone.
// domain_regex is OR'd with domain, so the literal domains still match — the
// regex itself isn't modeled
function matchEveryone(rule: AccessRule, attrs: RuleAttributes): RuleClassification | undefined {
  const everyone = isAbsentSubject(rule.subject)
    && attrs.placeholderDomains.length === 0
    && attrs.qualifiers.length === 0
    && attrs.domains.length > 0
  return everyone
    ? { kind: 'everyone', domains: attrs.domains, policy: attrs.policy }
    : undefined
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
    && !isSet(rule.domain_regex)
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
  return matchDeny(rule, attrs, knownGroups)
    ?? matchPlaceholder(rule, attrs)
    ?? matchEveryone(rule, attrs)
    ?? matchNoGroupSkip(attrs)
    ?? matchModeled(rule, attrs)
    ?? matchUnparsed(attrs, knownGroups)
}

function applyDeny(domains: string[], groups: string[] | undefined, decided: DecidedDomains): void {
  for (const domain of domains)
    decided.deny(domain, groups)
}

type GrantSource = GroupAccessPreview['domains'][number]['source']

// an earlier grant of this group already matched every request to the domain,
// so first-match never reaches a later rule for it
function isAlreadyGranted(group: string, domain: string, previewFor: PreviewFor): boolean {
  const target = domain.toLowerCase()
  return previewFor(group).domains.some(grant => domainCovers(grant.domain.toLowerCase(), target))
}

function applyGrant(group: string, domain: string, policy: string, source: GrantSource, decided: DecidedDomains, previewFor: PreviewFor): void {
  if (isAlreadyGranted(group, domain, previewFor))
    return
  const { allowed, carvedOut } = decided.decideGrant(group, domain)
  if (!allowed)
    return
  const preview = previewFor(group)
  preview.domains.push({ domain, policy, source })
  if (carvedOut.length === 0)
    return
  for (const [by, decider] of Object.entries(DECIDER_PHRASES)) {
    const patterns = carvedOut.filter(c => c.by === by).map(c => c.pattern)
    if (patterns.length === 0)
      continue
    const note = `${domain} is granted except ${patterns.join(', ')}, which ${decider} decides`
    if (!preview.notes.includes(note))
      preview.notes.push(note)
  }
}

function applyPlaceholderGrants(domains: string[], policy: string, knownGroups: string[], decided: DecidedDomains, previewFor: PreviewFor): void {
  for (const group of knownGroups) {
    for (const domain of domains.map(d => substituteLeadingPlaceholder(d, group)))
      applyGrant(group, domain, policy, 'group-placeholder', decided, previewFor)
  }
}

function applyEveryoneGrant(domains: string[], policy: string, knownGroups: string[], decided: DecidedDomains, previewFor: PreviewFor): void {
  for (const domain of domains) {
    for (const group of knownGroups)
      applyGrant(group, domain, policy, 'everyone', decided, previewFor)
  }
  // recorded only after the whole rule, so its own domains don't carve each other out
  for (const domain of domains)
    decided.grantEveryone(domain)
}

function applyModeledGrant(domains: string[], groups: string[], policy: string, decided: DecidedDomains, previewFor: PreviewFor): void {
  for (const group of groups) {
    for (const domain of domains)
      applyGrant(group, domain, policy, 'group-subject', decided, previewFor)
  }
}

function applyUnparsedRuleNotes(groups: string[], rule: AccessRule, previewFor: PreviewFor): void {
  for (const group of groups)
    previewFor(group).notes.push(`Unparsed access rule referencing this group: ${describeRule(rule)}`)
}

function collectAccessRuleGrants(rules: AccessRule[], knownGroups: string[], previewFor: PreviewFor): void {
  const decided = new DecidedDomains(knownGroups)
  for (const rule of rules) {
    const classification = classifyAccessRule(rule, knownGroups)
    switch (classification.kind) {
      case 'skip':
        continue
      case 'deny':
        applyDeny(classification.domains, classification.groups, decided)
        applyUnparsedRuleNotes(classification.notedGroups, rule, previewFor)
        continue
      case 'placeholder':
        applyPlaceholderGrants(classification.domains, classification.policy, knownGroups, decided, previewFor)
        applyEveryoneGrant(classification.literalDomains, classification.policy, knownGroups, decided, previewFor)
        continue
      case 'everyone':
        applyEveryoneGrant(classification.domains, classification.policy, knownGroups, decided, previewFor)
        continue
      case 'modeled':
        applyModeledGrant(classification.domains, classification.groups, classification.policy, decided, previewFor)
        continue
      case 'unparsed':
        applyUnparsedRuleNotes(classification.groups, rule, previewFor)
    }
  }
}

// first-match like access_control: a group an earlier rule matched as a whole —
// deny or grant — is decided, and no later rule in the policy is consulted for it
function decidePolicyRule(wholeGroups: string[], rulePolicy: string, decided: Set<string>, policyGrants: Map<string, string>): void {
  for (const group of wholeGroups.filter(g => !decided.has(g))) {
    decided.add(group)
    if (rulePolicy !== 'deny')
      policyGrants.set(group, rulePolicy)
  }
}

// a group an earlier rule decided is never consulted again, so the note would be noise
function applyUnparsedPolicyNotes(rule: any, policyName: string, decided: Set<string>, previewFor: PreviewFor): void {
  const undecided = subjectGroups(flattenSubjects(rule?.subject)).filter(g => !decided.has(g))
  for (const group of new Set(undecided))
    previewFor(group).notes.push(`Unparsed rule in OIDC policy "${policyName}": ${describeRule(rule)}`)
}

function collectPolicyRuleGrants(policyRules: any[], policyName: string, previewFor: PreviewFor): Map<string, string> {
  const policyGrants = new Map<string, string>()
  const decided = new Set<string>()

  for (const rule of policyRules) {
    const rulePolicy = typeof rule?.policy === 'string'
      ? rule.policy
      : 'unknown'
    // a rule scoped to some networks matches only part of a group's requests,
    // so it neither grants nor decides the group — every other request falls
    // through to later rules
    if (rule?.networks !== undefined) {
      applyUnparsedPolicyNotes(rule, policyName, decided, previewFor)
      continue
    }
    const wholeGroups = wholeSubjectGroups(rule?.subject)
    // a deny never unlocks anything, so one naming no whole group is no news;
    // a grant naming groups only inside an AND list can't be modeled
    if (rulePolicy !== 'deny' && wholeGroups.length === 0)
      applyUnparsedPolicyNotes(rule, policyName, decided, previewFor)
    decidePolicyRule(wholeGroups, rulePolicy, decided, policyGrants)
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
