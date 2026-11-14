import type { AccountRecord } from '../types/domain'
import { accountRole } from './account'

/**
 * Identity badges for the quiz system: Role (Student/Teacher), Rank (progress ladder
 * derived from quiz attempt aggregates — no XP involved), and Status (special grants).
 * Framework-free: labels and ids only; the Profile card maps ids to icons and tones.
 */

/** First public commit of kognit; the Pioneer window is the first year from this day. */
export const KOGNIT_LAUNCH_ISO_DATE = '2026-11-10'
export const PIONEER_WINDOW_YEARS = 1

export type RankId = 'learner' | 'apprentice' | 'scholar' | 'strategist' | 'luminary'

export const RANKS: Readonly<Record<RankId, string>> = Object.freeze({
  learner: 'Learner',
  apprentice: 'Apprentice',
  scholar: 'Scholar',
  strategist: 'Strategist',
  luminary: 'Luminary',
})

/** Attempt aggregates written only by the grading function; rank is a pure read of these. */
export interface RankStats {
  quizzesPassed: number
  currentStreak: number
  lifetimeAccuracy: number
}

export type StatusBadgeId = 'pioneer' | 'early-educator' | 'quiz-architect' | 'perfect-round' | 'founders-pick'

export interface ProfileBadgeDescriptor {
  id: string
  kind: 'role' | 'rank' | 'status'
  label: string
}

const LAUNCH_MS = Date.parse(`${KOGNIT_LAUNCH_ISO_DATE}T00:00:00`)

/** Pioneer: account created within the first year after launch. */
export function isPioneer(createdAt: unknown, now: number = Date.now()): boolean {
  const timestamp = typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : Date.parse(String(createdAt ?? ''))
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false
  const windowMs = PIONEER_WINDOW_YEARS * 365 * 24 * 60 * 60 * 1000
  return timestamp >= LAUNCH_MS && timestamp < LAUNCH_MS + windowMs
}

/** Rank is deterministic from aggregates; a null stats record means default Learner. */
export function rankFromStats(stats: RankStats | null): RankId {
  if (!stats) return 'learner'
  const passed = Number.isSafeInteger(stats.quizzesPassed) && stats.quizzesPassed > 0 ? stats.quizzesPassed : 0
  const streak = Number.isSafeInteger(stats.currentStreak) && stats.currentStreak > 0 ? stats.currentStreak : 0
  const accuracy = Number.isFinite(stats.lifetimeAccuracy) && stats.lifetimeAccuracy >= 0 && stats.lifetimeAccuracy <= 100 ? stats.lifetimeAccuracy : 0
  if (passed >= 100 && streak >= 10 && accuracy >= 90) return 'luminary'
  if (passed >= 40 && streak >= 5 && accuracy >= 85) return 'strategist'
  if (passed >= 15 && streak >= 3) return 'scholar'
  if (passed >= 5) return 'apprentice'
  return 'learner'
}

export interface StatusBadgeInputs {
  pioneer: boolean
  quizzesCreated: number
  hasPerfectAttempt: boolean
  earlyEducator: boolean
}

/** Auto status badges for the current account; Founder's Pick is manual and appended elsewhere. */
export function statusBadges(inputs: StatusBadgeInputs): StatusBadgeId[] {
  const badges: StatusBadgeId[] = []
  if (inputs.pioneer) badges.push('pioneer')
  if (inputs.earlyEducator) badges.push('early-educator')
  if (Number.isSafeInteger(inputs.quizzesCreated) && inputs.quizzesCreated >= 10) badges.push('quiz-architect')
  if (inputs.hasPerfectAttempt) badges.push('perfect-round')
  return badges
}

export const STATUS_BADGE_LABELS: Readonly<Record<StatusBadgeId, string>> = Object.freeze({
  pioneer: 'Pioneer',
  'early-educator': 'Early Educator',
  'quiz-architect': 'Quiz Architect',
  'perfect-round': 'Perfect Round',
  'founders-pick': "Founder's Pick",
})

/** Builds the badge row for one account's own profile (public projection gating lands in Slice 4). */
export function profileBadges(account: AccountRecord, stats: RankStats | null = null, statuses: StatusBadgeInputs = { pioneer: isPioneer(account.createdAt), quizzesCreated: 0, hasPerfectAttempt: false, earlyEducator: false }): ProfileBadgeDescriptor[] {
  const badges: ProfileBadgeDescriptor[] = [
    { id: accountRole(account), kind: 'role', label: accountRole(account) === 'teacher' ? 'Teacher' : 'Student' },
    { id: rankFromStats(stats), kind: 'rank', label: RANKS[rankFromStats(stats)] },
  ]
  for (const status of statusBadges(statuses)) {
    badges.push({ id: status, kind: 'status', label: STATUS_BADGE_LABELS[status] })
  }
  return badges
}
