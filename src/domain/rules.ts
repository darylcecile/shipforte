export const tiers = { small: 50, medium: 80, large: 120, xlarge: 160 } as const
export type Tier = keyof typeof tiers
export const day = 86_400_000
export const categories = ['Tools', 'Productivity', 'Creative', 'Community', 'Games', 'Learning'] as const

export function onTime(submittedAt: number, deadline: number) {
  return submittedAt < deadline
}
export function repeatAward(full: number) {
  return full / 5
}
export function attemptAward(
  kind: 'initial' | 'repeat' | 'redo' | 'moderator',
  full: number,
  revoked: boolean,
  earned: number,
): number {
  if (kind === 'redo') return earned
  if (kind === 'repeat' || (kind === 'moderator' && !revoked)) return repeatAward(full)
  return full
}
export function redoEligible(up: number, down: number, redo: number) {
  const total = up + down + redo
  return total >= 30 && redo * 4 >= total
}
export function ranks<T>(items: T[], score: (item: T) => number) {
  let rank = 0
  let previous: number | undefined
  return [...items]
    .sort((a, b) => score(b) - score(a))
    .map((item, index) => {
      const value = score(item)
      if (value !== previous) rank = index + 1
      previous = value
      return { ...item, rank }
    })
}
export function screenshotType(bytes: Uint8Array): string | null {
  const hex = Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  if (hex.startsWith('52494646') && hex.slice(16) === '57454250') return 'image/webp'
  return null
}
export function copiedFiles(shared: number, currentCount: number, originalCount: number) {
  return shared >= 3 && shared / Math.min(currentCount, originalCount) >= 0.8
}
