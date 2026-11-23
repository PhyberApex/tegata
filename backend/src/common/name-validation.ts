import type { PipeTransform } from '@nestjs/common'
import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { ArrayUnique, IsArray, IsNotEmpty, IsString, ValidateIf } from 'class-validator'

function trimValue(value: unknown) {
  return typeof value === 'string'
    ? value.trim()
    : value
}

/**
 * An optional field that may be omitted but not sent as JSON `null`: `@IsOptional()` skips validation for
 * both, and every service reads a field as absent only when it is `undefined`.
 */
export function IsOptionalNotNull() {
  return ValidateIf((_, value) => value !== undefined)
}

/** Trims the string, then rejects empty / whitespace-only values. */
export function IsTrimmedNonEmpty() {
  return applyDecorators(
    Transform(({ value }) => trimValue(value)),
    IsString(),
    IsNotEmpty(),
  )
}

/** An array of trimmed, non-empty, unique strings. */
export function IsGroupList() {
  return applyDecorators(
    Transform(({ value }) => (Array.isArray(value)
      ? value.map(trimValue)
      : value)),
    IsArray(),
    IsString({ each: true }),
    IsNotEmpty({ each: true }),
    ArrayUnique(),
  )
}

/** Trims a route param so `/groups/%20users` addresses `users`. */
export class TrimPipe implements PipeTransform<string, string> {
  transform(value: string) {
    return trimValue(value) as string
  }
}
