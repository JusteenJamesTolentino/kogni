import { onDisconnect, onValue, push, ref, remove, set } from 'firebase/database'
import type { Unsubscribe } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { requireReadyAccount } from './account'
import { authenticatedRequest } from './vercel-api'
import type { ApiRequestOptions } from './vercel-api'
import type { PublicPresence } from '../types/domain'

const FIREBASE_KEY_PATTERN = /^[^.#$[\]/]{1,200}$/
export const PRESENCE_POLL_INTERVAL_MS = 15_000

export interface PresenceSession {
  readonly sessionId: string
  stop(): Promise<void>
}

export interface PresenceSubscriptionOptions extends ApiRequestOptions {
  intervalMs?: number
}

function requireUser(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated user is required')
  }
  return user
}

function requireUid(value: unknown): string {
  if (typeof value !== 'string' || !FIREBASE_KEY_PATTERN.test(value)) {
    throw new TypeError('uid must be a valid Firebase key')
  }
  return value
}

function reportError(value: unknown, callback?: (error: Error) => void): void {
  const error = value instanceof Error ? value : new Error('Presence could not be updated.')
  try {
    if (callback) callback(error)
    else console.error('Presence could not be updated.', error)
  } catch {
    // Consumer error handlers must not leave background promises unhandled.
    console.error('The presence error callback failed.')
  }
}

/** Aggregates opaque per-session markers without exposing timestamps or last-seen. */
export function aggregatePresence(value: unknown): PublicPresence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { online: false }
  return { online: Object.values(value).some((marker) => marker === true) }
}

export function isPublicPresence(value: unknown): value is PublicPresence {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === 1 && 'online' in value && typeof value.online === 'boolean'
}

/** Each tab owns only its private marker; the server derives shared online projections. */
export async function startPresenceSession(
  user: User | null | undefined,
  error?: (error: Error) => void,
): Promise<PresenceSession> {
  const authenticatedUser = requireUser(user)
  const account = await requireReadyAccount(authenticatedUser)
  if (!account.preferences.presence) throw new Error('Presence sharing is disabled')

  const sessionId = push(ref(database, `presenceSessions/${authenticatedUser.uid}`)).key
  if (!sessionId) throw new Error('Could not allocate a presence session')
  const sessionRef = ref(database, `presenceSessions/${authenticatedUser.uid}/${sessionId}`)
  const connectedRef = ref(database, '.info/connected')
  let stopped = false
  let operation = Promise.resolve()
  let stopPromise: Promise<void> | undefined

  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (stopped || snapshot.val() !== true) return
    operation = operation.then(async () => {
      if (stopped) return
      // Install disconnect cleanup before publishing, including after every reconnect.
      await onDisconnect(sessionRef).remove()
      if (!stopped) await set(sessionRef, true)
    }).catch((publishError: unknown) => reportError(publishError, error))
  }, (connectionError) => {
    if (!stopped) reportError(connectionError, error)
  })

  return {
    sessionId,
    stop() {
      if (stopPromise) return stopPromise
      stopped = true
      unsubscribe()
      stopPromise = (async () => {
        await operation
        // Keep disconnect cleanup armed if explicit marker removal fails.
        await remove(sessionRef)
        await onDisconnect(sessionRef).cancel()
      })()
      return stopPromise
    },
  }
}

export async function getPresence(uid: unknown, options?: ApiRequestOptions): Promise<PublicPresence> {
  const targetUid = requireUid(uid)
  return authenticatedRequest(`/api/players/${encodeURIComponent(targetUid)}/presence`, isPublicPresence, options)
}

/** Poll only after the previous request settles; unsubscribe aborts all pending work. */
export function subscribeToPresence(
  uid: unknown,
  callback: (presence: PublicPresence) => void,
  error?: (error: Error) => void,
  options: PresenceSubscriptionOptions = {},
): Unsubscribe {
  const targetUid = requireUid(uid)
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const intervalMs = options.intervalMs ?? PRESENCE_POLL_INTERVAL_MS
  if (!Number.isFinite(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) {
    throw new TypeError('intervalMs must be a positive finite timer duration')
  }
  const controller = new AbortController()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    controller.abort()
    options.signal?.removeEventListener('abort', stop)
  }
  options.signal?.addEventListener('abort', stop, { once: true })
  if (options.signal?.aborted) {
    stop()
    return stop
  }

  const poll = async () => {
    try {
      const presence = await getPresence(targetUid, { signal: controller.signal, timeoutMs: options.timeoutMs })
      if (!stopped) callback(presence)
    } catch (pollError: unknown) {
      if (!stopped) reportError(pollError, error)
    } finally {
      if (!stopped) timer = setTimeout(() => { void poll() }, intervalMs)
    }
  }
  void poll()
  return stop
}
