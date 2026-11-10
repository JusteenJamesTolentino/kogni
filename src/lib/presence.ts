import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from 'firebase/database'
import type { Unsubscribe } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { requireReadyAccount } from './account'
import type { PublicPresence } from '../types/domain'

const FIREBASE_KEY_PATTERN = /^[^.#$[\]/]{1,200}$/

export interface PresenceSession {
  readonly sessionId: string
  stop(): Promise<void>
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

/** Aggregates opaque per-session markers without exposing timestamps or last-seen. */
export function aggregatePresence(value: unknown): PublicPresence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { online: false }
  return { online: Object.values(value).some((marker) => marker === true) }
}

/**
 * Registers one browser/tab session. Firebase removes its marker on disconnect;
 * the aggregate remains online while at least one session marker survives.
 */
export async function startPresenceSession(
  user: User | null | undefined,
): Promise<PresenceSession> {
  const authenticatedUser = requireUser(user)
  const account = await requireReadyAccount(authenticatedUser)
  if (!account.preferences.presence) {
    throw new Error('Presence sharing is disabled')
  }

  const sessionId = push(ref(database, `presenceSessions/${authenticatedUser.uid}`)).key
  if (!sessionId) throw new Error('Could not allocate a presence session')
  const sessionRef = ref(database, `presenceSessions/${authenticatedUser.uid}/${sessionId}`)
  const connectedRef = ref(database, '.info/connected')
  let stopped = false
  let operation = Promise.resolve()

  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (stopped || snapshot.val() !== true) return
    operation = operation.then(async () => {
      if (stopped) return
      await onDisconnect(sessionRef).remove()
      await set(sessionRef, true)
    })
  })

  return {
    sessionId,
    async stop() {
      if (stopped) return
      stopped = true
      unsubscribe()
      await operation
      await onDisconnect(sessionRef).cancel()
      await remove(sessionRef)
    },
  }
}

export async function getPresence(uid: unknown): Promise<PublicPresence> {
  const targetUid = requireUid(uid)
  const snapshot = await get(ref(database, `activePlayers/${targetUid}`))
  return { online: snapshot.exists() }
}

export function subscribeToPresence(
  uid: unknown,
  callback: (presence: PublicPresence) => void,
  error?: (error: Error) => void,
): Unsubscribe {
  const targetUid = requireUid(uid)
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  return onValue(
    ref(database, `activePlayers/${targetUid}`),
    (snapshot) => callback({ online: snapshot.exists() }),
    typeof error === 'function' ? error : undefined,
  )
}
