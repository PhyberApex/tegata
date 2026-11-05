// The one rule for new usernames, shared by the backend (which enforces it) and
// the frontend (which checks it before submitting). A deployment can override it
// with USERNAME_PATTERN; the backend then hands the effective source to the
// frontend. It gates new usernames only; users already on file are never re-checked.
export const DEFAULT_USERNAME_PATTERN = '^[a-z0-9][a-z0-9._-]{0,63}$'

export const DEFAULT_USERNAME_RULE = 'lowercase letters, digits, dots, underscores and hyphens; must start with a letter or digit; at most 64 characters'

/** Compiles a pattern source, throwing a readable error when it is not a valid regular expression. */
export function compileUsernamePattern(source: string = DEFAULT_USERNAME_PATTERN): RegExp {
  try {
    return new RegExp(source)
  }
  catch (err) {
    throw new Error(`USERNAME_PATTERN is not a valid regular expression: ${err instanceof Error
      ? err.message
      : String(err)}`)
  }
}

export function isValidUsername(username: string, source: string = DEFAULT_USERNAME_PATTERN): boolean {
  return compileUsernamePattern(source).test(username)
}

/** Describes the rule in words; a custom pattern is quoted since it cannot be paraphrased. */
export function usernameRuleMessage(source: string = DEFAULT_USERNAME_PATTERN): string {
  return source === DEFAULT_USERNAME_PATTERN
    ? `Username must use ${DEFAULT_USERNAME_RULE}`
    : `Username must match the pattern ${source}`
}
