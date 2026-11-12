import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

// A minimal hook adapter isolates provider async lifecycle from DOM/test-renderer dependencies.
const mocks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  pendingEffects: [] as (() => void)[],
  context: null as any,
  authCallback: null as null | ((user: User | null) => void),
  authError: null as null | ((error: Error) => void),
  unsubscribe: vi.fn(),
  getAccount: vi.fn(),
  completeOnboarding: vi.fn(),
  startPresence: vi.fn(),
  signOut: vi.fn(),
  setDatabaseUser: vi.fn(),
}))
vi.mock('react', () => ({
  createContext: () => {
    mocks.context = { current: null, Provider: Symbol('Provider') }
    return mocks.context
  },
  useContext: (context: any) => context.current,
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!mocks.slots[index]) mocks.slots[index] = { value: initial }
    return [mocks.slots[index].value, (next: unknown) => { mocks.slots[index].value = next }]
  },
  useRef: (initial: unknown) => {
    const index = mocks.cursor++
    if (!mocks.slots[index]) mocks.slots[index] = { current: initial }
    return mocks.slots[index]
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = mocks.cursor++
    const previous = mocks.slots[index]
    if (!previous || deps.some((dep, position) => !Object.is(dep, previous.deps[position]))) {
      mocks.pendingEffects.push(() => {
        previous?.cleanup?.()
        mocks.slots[index] = { deps, cleanup: effect() }
      })
    }
  },
}))
vi.mock('../../src/lib/firebase', () => ({ auth: {}, googleProvider: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void, error: (error: Error) => void) => {
    mocks.authCallback = callback
    mocks.authError = error
    return mocks.unsubscribe
  },
  signOut: mocks.signOut,
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
}))
vi.mock('../../src/lib/account', () => ({ getAccount: mocks.getAccount, completeAccountOnboarding: mocks.completeOnboarding }))
vi.mock('../../src/lib/presence', () => ({ startPresenceSession: mocks.startPresence }))
vi.mock('../../src/lib/db', () => ({ setDatabaseUser: mocks.setDatabaseUser }))

import { AuthProvider, useAuth } from '../../src/context/AuthContext'

const userA = { uid: 'user-a' } as User
const userB = { uid: 'user-b' } as User
const accountA = { uid: userA.uid, preferences: { presence: true, discoverable: true } }
const accountB = { uid: userB.uid, preferences: { presence: true, discoverable: true } }
const render = () => {
  mocks.cursor = 0
  const element = AuthProvider({ children: null })
  mocks.context.current = element.props.value
  for (const effect of mocks.pendingEffects.splice(0)) effect()
}
const flush = async () => {
  for (let index = 0; index < 12; index++) {
    await Promise.resolve()
    render()
  }
}
const unmount = () => {
  for (const slot of mocks.slots) {
    slot?.cleanup?.()
    if (slot?.cleanup) slot.cleanup = undefined
  }
}
const session = (sessionId: string) => ({ sessionId, stop: vi.fn().mockResolvedValue(undefined) })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  mocks.slots.length = 0
  mocks.pendingEffects.length = 0
  mocks.context.current = null
  mocks.authCallback = null
  mocks.unsubscribe.mockReset()
  mocks.getAccount.mockReset().mockImplementation(async (user: User) => user.uid === userA.uid ? accountA : accountB)
  mocks.completeOnboarding.mockReset().mockResolvedValue(accountA)
  mocks.startPresence.mockReset().mockImplementation(async (user: User) => session(user.uid))
  mocks.signOut.mockReset().mockResolvedValue(undefined)
  mocks.setDatabaseUser.mockReset()
  vi.stubGlobal('localStorage', { removeItem: vi.fn() })
  render()
})
afterEach(async () => {
  unmount()
  for (let index = 0; index < 12; index++) await Promise.resolve()
  vi.unstubAllGlobals()
})

describe('AuthProvider async presence and stale auth lifecycle', () => {
  it('ignores an older account callback after another user signs in', async () => {
    const oldAccount = deferred<typeof accountA>()
    mocks.getAccount.mockReturnValueOnce(oldAccount.promise)
    mocks.authCallback!(userA)
    render()
    mocks.authCallback!(userB)
    await flush()
    expect(useAuth().account?.uid).toBe(userB.uid)
    expect(useAuth().accountLoading).toBe(false)
    oldAccount.resolve(accountA)
    await flush()
    expect(useAuth().account?.uid).toBe(userB.uid)
    expect(mocks.startPresence).toHaveBeenCalledTimes(1)
    expect(mocks.startPresence.mock.calls[0][0]).toBe(userB)
  })

  it('does not resurrect an account or presence after sign-out', async () => {
    const oldAccount = deferred<typeof accountA>()
    mocks.getAccount.mockReturnValueOnce(oldAccount.promise)
    mocks.authCallback!(userA)
    render()
    mocks.authCallback!(null)
    await flush()
    oldAccount.resolve(accountA)
    await flush()
    expect(useAuth().user).toBeNull()
    expect(useAuth().account).toBeNull()
    expect(useAuth().accountLoading).toBe(false)
    expect(mocks.startPresence).not.toHaveBeenCalled()
  })

  it('catches presence startup failures and surfaces the error without unhandled promises', async () => {
    mocks.startPresence.mockRejectedValue(new Error('Presence unavailable'))
    mocks.authCallback!(userA)
    await flush()
    expect(useAuth().accountError).toBe('Presence unavailable')
  })

  it('stops a late stale session without stopping the newer owned session, even if stale cleanup rejects', async () => {
    const oldStart = deferred<ReturnType<typeof session>>()
    const oldSession = session('old')
    oldSession.stop.mockRejectedValue(new Error('Old cleanup failed'))
    const newSession = session('new')
    mocks.startPresence.mockReturnValueOnce(oldStart.promise).mockResolvedValueOnce(newSession)
    mocks.authCallback!(userA)
    await flush()
    mocks.authCallback!(userB)
    await flush()
    oldStart.resolve(oldSession)
    await flush()
    expect(oldSession.stop).toHaveBeenCalledOnce()
    expect(newSession.stop).not.toHaveBeenCalled()
    expect(useAuth().accountError).toBe('')
    unmount()
    expect(newSession.stop).toHaveBeenCalledOnce()
  })

  it('handles owned session cleanup rejection and never restarts for discoverability alone', async () => {
    const owned = session('owned')
    owned.stop.mockRejectedValue(new Error('Cleanup failed'))
    mocks.startPresence.mockResolvedValue(owned)
    mocks.authCallback!(userA)
    await flush()
    mocks.getAccount.mockResolvedValue({ ...accountA, preferences: { presence: true, discoverable: false } })
    await useAuth().refreshAccount()
    await flush()
    expect(mocks.startPresence).toHaveBeenCalledOnce()
    mocks.authCallback!(null)
    await flush()
    expect(owned.stop).toHaveBeenCalledOnce()
    expect(useAuth().account).toBeNull()
  })

  it('still signs out and clears local model settings if presence cleanup rejects', async () => {
    const owned = session('owned')
    owned.stop.mockRejectedValue(new Error('Cleanup failed'))
    mocks.startPresence.mockResolvedValue(owned)
    mocks.authCallback!(userA)
    await flush()
    await expect(useAuth().signOutUser()).resolves.toBeUndefined()
    expect(owned.stop).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(localStorage.removeItem).toHaveBeenCalledTimes(2)
  })

  it('guards stale refresh and onboarding results from changing the current account', async () => {
    mocks.authCallback!(userA)
    await flush()
    const refresh = deferred<typeof accountA>()
    mocks.getAccount.mockReturnValueOnce(refresh.promise)
    const refreshResult = useAuth().refreshAccount()
    const onboarding = deferred<typeof accountA>()
    mocks.completeOnboarding.mockReturnValueOnce(onboarding.promise)
    const onboardingResult = useAuth().completeOnboarding({ nickname: 'User_A', acknowledgedPrivacyVersion: 'test' })
    mocks.authCallback!(userB)
    await flush()
    refresh.resolve(accountA)
    onboarding.resolve(accountA)
    await Promise.all([refreshResult, onboardingResult])
    await flush()
    expect(useAuth().account?.uid).toBe(userB.uid)
    expect(useAuth().accountLoading).toBe(false)
  })

  it('invalidates pending account reads on auth error and ignores callbacks after unmount', async () => {
    const oldAccount = deferred<typeof accountA>()
    mocks.getAccount.mockReturnValueOnce(oldAccount.promise)
    mocks.authCallback!(userA)
    render()
    mocks.authError!(new Error('Auth unavailable'))
    await flush()
    oldAccount.resolve(accountA)
    await flush()
    expect(useAuth().user).toBeNull()
    expect(useAuth().account).toBeNull()
    expect(useAuth().error).toBe('Auth unavailable')
    const requestCount = mocks.getAccount.mock.calls.length
    unmount()
    mocks.authCallback!(userB)
    expect(mocks.getAccount).toHaveBeenCalledTimes(requestCount)
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})
