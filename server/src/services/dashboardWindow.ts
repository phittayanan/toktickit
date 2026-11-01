// Asia/Bangkok is UTC+7 all year.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

// BR-28: 00:00 Asia/Bangkok six calendar days before today's Bangkok date.
export function recentWindowStart(now: Date): Date {
  const bangkok = new Date(now.getTime() + BANGKOK_OFFSET_MS)
  const midnight = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() - 6)

  return new Date(midnight - BANGKOK_OFFSET_MS)
}
