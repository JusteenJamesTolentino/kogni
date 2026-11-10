export const paths = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  onboarding: '/onboarding',
  privacy: '/privacy',
  profile: '/profile',
  dashboard: '/',
  import: '/import',
  community: '/community',
  leaderboards: '/leaderboards',
  onlineDecks: '/online-decks',
  studyDue: '/study/due',
} as const

export function playerProfilePath(playerId: string): string {
  return `/players/${encodeURIComponent(playerId)}`
}

export function onlineDeckPath(deckId: string): string {
  return `${paths.onlineDecks}/${encodeURIComponent(deckId)}`
}

export function onlineDeckEditPath(deckId: string): string {
  return `${onlineDeckPath(deckId)}/edit`
}

export function onlineDeckStudyPath(deckId: string): string {
  return `${onlineDeckPath(deckId)}/study`
}

export function onlineDeckContinuePath(deckId: string): string {
  return `${onlineDeckPath(deckId)}/continue`
}

export function onlineDeckStudySeriesPath(deckId: string): string {
  return `${onlineDeckPath(deckId)}/study`
}

export function deckPath(deckId: string): string {
  return `/decks/${encodeURIComponent(deckId)}`
}

export function deckLeaderboardPath(deckId: string): string {
  return `${deckPath(deckId)}/leaderboard`
}

export function deckStudyPath(deckId: string, mode: 'due' | 'practice'): string {
  return `${deckPath(deckId)}/study/${mode}`
}

export function deckEditPath(deckId: string): string {
  return `${deckPath(deckId)}/edit`
}

export function deckRegeneratePath(deckId: string): string {
  return `${deckPath(deckId)}/regenerate`
}

export function normalizePortalCode(code: string): string {
  return code.trim().toUpperCase()
}

export function portalPath(code: string): string {
  return `/portal/${encodeURIComponent(normalizePortalCode(code))}`
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  if (value.includes('\\') || hasControlCharacters(value)) return false

  try {
    const base = new URL('https://kognit.invalid')
    const resolved = new URL(value, base)
    return resolved.origin === base.origin && resolved.pathname !== paths.signIn && resolved.pathname !== paths.onboarding
  } catch {
    return false
  }
}

/**
 * Accepts only same-origin absolute paths for post-auth navigation. Values such
 * as full URLs, protocol-relative URLs, backslash variants, and /sign-in loops
 * fall back to the dashboard.
 */
export function getSafeRedirectTarget(value: unknown, fallback: string = paths.dashboard): string {
  return typeof value === 'string' && isSafeInternalPath(value) ? value : fallback
}

export interface AuthRedirectState {
  from: string
}

export function createAuthRedirectState(pathname: string, search: string = '', hash: string = ''): AuthRedirectState {
  return { from: getSafeRedirectTarget(`${pathname}${search}${hash}`) }
}
