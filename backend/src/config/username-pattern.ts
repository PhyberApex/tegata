import process from 'node:process'
import { compileUsernamePattern, DEFAULT_USERNAME_PATTERN, isValidUsername, usernameRuleMessage } from '@tegata/shared'
import { registerDecorator } from 'class-validator'

/** The effective pattern source: USERNAME_PATTERN when set and non-empty, else the shared default. */
export function usernamePatternSource(): string {
  return process.env.USERNAME_PATTERN?.trim() || DEFAULT_USERNAME_PATTERN
}

/** Throws when USERNAME_PATTERN does not compile, so a bad pattern refuses to boot. */
export function assertUsernamePattern(): void {
  compileUsernamePattern(usernamePatternSource())
}

/** class-validator decorator: the value must match the effective username pattern; the 400 names the rule. */
export function IsUsername(): PropertyDecorator {
  return (target, propertyKey) => registerDecorator({
    name: 'isUsername',
    target: target.constructor,
    propertyName: propertyKey as string,
    validator: {
      validate: value => typeof value === 'string' && isValidUsername(value, usernamePatternSource()),
      defaultMessage: () => usernameRuleMessage(usernamePatternSource()),
    },
  })
}
