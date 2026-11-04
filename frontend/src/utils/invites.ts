export function inviteUrl(token: string): string {
  return `${window.location.origin}/register/${token}`
}
