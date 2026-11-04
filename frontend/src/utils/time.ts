export function timeUntilExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0)
    return 'Expired'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0)
    return `${days}d ${hours}h`
  if (hours > 0)
    return `${hours}h`
  // Still accepted by the backend until the instant itself, so the last hour must not read as "0h".
  const minutes = Math.floor(diff / 60000)
  return minutes > 0
    ? `${minutes}m`
    : '<1m'
}
