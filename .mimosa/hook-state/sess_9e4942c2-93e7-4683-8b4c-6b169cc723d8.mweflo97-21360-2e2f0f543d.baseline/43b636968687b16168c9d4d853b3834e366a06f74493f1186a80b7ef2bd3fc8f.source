import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; getIdToken: ReturnType<typeof vi.fn> } },
  readyAccount: vi.fn(),
  listeners: [] as { callback: (snapshot: { val(): unknown }) => void; error: (error: Error) => void; unsubscribe: ReturnType<typeof vi.fn> }[],
  markers: new Map<string, true>(),
  hooks: new Map<string, { remove: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }>(),
  ref: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  onDisconnect: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('../../src/lib/firebase', () => ({ auth: mocks.auth, database: {} }))
vi.mock('../../src/lib/account', () => ({ requireReadyAccount: mocks.readyAccount }))
vi.mock('firebase/database', () => ({
  ref: mocks.ref,
  push: mocks.push,
  set: mocks.set,
  remove: mocks.remove,
  onDisconnect: mocks.onDisconnect,
  onValue: vi.fn((_reference, callback, error) => {
    const unsubscribe = vi.fn()
    mocks.listeners.push({ callback, error, unsubscribe })
    return unsubscribe
  }),
}))

import { aggregatePresence, getPresence, isPublicPresence, startPresenceSession, subscribeToPresence } from '../../src/lib/presence'

const user = { uid: 'viewer' } as User
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
function connect(index: number, value = true) {
  mocks.listeners[index].callback({ val: () => value })
}
function currentPresence() {
  return aggregatePresence(Object.fromEntries(mocks.markers))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.listeners.length = 0
  mocks.markers.clear()
  mocks.hooks.clear()
  mocks.auth.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('test-token') }
  mocks.readyAccount.mockReset().mockResolvedValue({ preferences: { presence: true, discoverable: true } })
  mocks.ref.mockReset().mockImplementation((_database, path) => ({ path }))
  let sessionCount = 0
  mocks.push.mockReset().mockImplementation(() => ({ key: `tab-${++sessionCount}` }))
  mocks.set.mockReset().mockImplementation(async ({ path }, value) => { mocks.markers.set(path, value) })
  mocks.remove.mockReset().mockImplementation(async ({ path }) => { mocks.markers.delete(path) })
  mocks.onDisconnect.mockReset().mockImplementation(({ path }) => {
    if (!mocks.hooks.has(path)) mocks.hooks.set(path, {
      remove: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    })
    return mocks.hooks.get(path)
  })
  mocks.fetch.mockReset().mockResolvedValue(new Response('{"online":true}'))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('private per-tab presence lifecycle', () => {
  it('keeps two tabs independently online and stops only the owned marker', async () => {
    const tabA = await startPresenceSession(user)
    const tabB = await startPresenceSession(user)
    expect(tabA.sessionId).not.toBe(tabB.sessionId)
    connect(0)
    connect(1)
    await flush()
    expect([...mocks.markers.keys()]).toEqual(['presenceSessions/viewer/tab-1', 'presenceSessions/viewer/tab-2'])
    expect(currentPresence()).toEqual({ online: true })
    for (const [path, hook] of mocks.hooks) {
      const setIndex = mocks.set.mock.calls.findIndex(([reference]) => reference.path === path)
      expect(hook.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[setIndex])
    }
    const stopA = tabA.stop()
    expect(tabA.stop()).toBe(stopA)
    await stopA
    expect([...mocks.markers.keys()]).toEqual(['presenceSessions/viewer/tab-2'])
    expect(currentPresence()).toEqual({ online: true })
    await tabB.stop()
    expect(currentPresence()).toEqual({ online: false })
    expect(mocks.listeners.every((listener) => listener.unsubscribe.mock.calls.length === 1)).toBe(true)
    expect(mocks.ref.mock.calls.every(([, path]) => path === '.info/connected' || path.startsWith('presenceSessions/'))).toBe(true)
    expect(mocks.onDisconnect.mock.calls.every(([reference]) => reference.path.startsWith('presenceSessions/viewer/'))).toBe(true)
    expect(mocks.remove).toHaveBeenCalledTimes(2)
  })

  it('re-registers disconnect cleanup before publishing after a reconnect', async () => {
    const session = await startPresenceSession(user)
    connect(0)
    await flush()
    const path = 'presenceSessions/viewer/tab-1'
    mocks.markers.delete(path)
    connect(0, false)
    await flush()
    expect(currentPresence()).toEqual({ online: false })
    expect(mocks.set).toHaveBeenCalledTimes(1)
    connect(0)
    await flush()
    expect(mocks.hooks.get(path)!.remove).toHaveBeenCalledTimes(2)
    expect(mocks.set).toHaveBeenCalledTimes(2)
    expect(currentPresence()).toEqual({ online: true })
    await session.stop()
    connect(0)
    await flush()
    expect(mocks.set).toHaveBeenCalledTimes(2)
  })

  it('does not publish after stop while disconnect registration is pending', async () => {
    const registration = deferred<void>()
    const cancel = vi.fn().mockResolvedValue(undefined)
    mocks.onDisconnect.mockReturnValue({ remove: vi.fn().mockReturnValue(registration.promise), cancel })
    const session = await startPresenceSession(user)
    connect(0)
    await flush()
    const stop = session.stop()
    registration.resolve(undefined)
    await stop
    expect(mocks.set).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith({ path: 'presenceSessions/viewer/tab-1' })
  })

  it('queues reconnect work instead of overlapping marker writes', async () => {
    const publishing = deferred<void>()
    mocks.set.mockReturnValueOnce(publishing.promise)
    const session = await startPresenceSession(user)
    connect(0)
    connect(0)
    await flush()
    expect(mocks.set).toHaveBeenCalledTimes(1)
    publishing.resolve(undefined)
    await flush()
    expect(mocks.set).toHaveBeenCalledTimes(2)
    await session.stop()
  })

  it('reports publication and connection errors and can recover on the next reconnect', async () => {
    const error = vi.fn()
    const failure = new Error('Permission denied')
    mocks.set.mockRejectedValueOnce(failure)
    const session = await startPresenceSession(user, error)
    connect(0)
    await flush()
    expect(error).toHaveBeenCalledWith(failure)
    mocks.listeners[0].error(failure)
    expect(error).toHaveBeenCalledTimes(2)
    connect(0)
    await flush()
    expect(currentPresence()).toEqual({ online: true })
    await session.stop()
    mocks.listeners[0].error(failure)
    expect(error).toHaveBeenCalledTimes(2)
  })

  it('still removes the marker when cancellation fails, and shares the stop rejection', async () => {
    const session = await startPresenceSession(user)
    connect(0)
    await flush()
    const failure = new Error('Disconnect cancellation failed')
    mocks.hooks.get('presenceSessions/viewer/tab-1')!.cancel.mockRejectedValue(failure)
    const stop = session.stop()
    await expect(stop).rejects.toBe(failure)
    expect(session.stop()).toBe(stop)
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(currentPresence()).toEqual({ online: false })
  })

  it('preserves onDisconnect removal if an explicit stop removal fails', async () => {
    const session = await startPresenceSession(user)
    connect(0)
    await flush()
    const failure = new Error('Offline removal failed')
    mocks.remove.mockRejectedValueOnce(failure)
    await expect(session.stop()).rejects.toBe(failure)
    expect(mocks.hooks.get('presenceSessions/viewer/tab-1')!.cancel).not.toHaveBeenCalled()
  })

  it('does not register or write presence for a disabled or invalid account', async () => {
    mocks.readyAccount.mockResolvedValue({ preferences: { presence: false } })
    await expect(startPresenceSession(user)).rejects.toThrow('disabled')
    await expect(startPresenceSession(null)).rejects.toThrow('authenticated user')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('does not require discoverability to publish an opted-in private session', async () => {
    mocks.readyAccount.mockResolvedValue({ preferences: { presence: true, discoverable: false } })
    const session = await startPresenceSession(user)
    connect(0)
    await flush()
    expect(mocks.set).toHaveBeenCalledWith({ path: 'presenceSessions/viewer/tab-1' }, true)
    await session.stop()
  })
})

describe('authenticated presence polling', () => {
  it('accepts only the public online boolean response', async () => {
    expect(await getPresence('player-1')).toEqual({ online: true })
    expect(mocks.fetch).toHaveBeenCalledWith('/api/players/player-1/presence', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer test-token' }) }))
    for (const malformed of [null, [], {}, { online: 'true' }, { online: false, lastSeen: 123 }]) {
      expect(isPublicPresence(malformed)).toBe(false)
      mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(malformed)))
      await expect(getPresence('player-1')).rejects.toMatchObject({ code: 'invalid-response' })
    }
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it('never overlaps polls, aborts the current request, and ignores a late response', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const callback = vi.fn()
    const error = vi.fn()
    const unsubscribe = subscribeToPresence('player-1', callback, error, { intervalMs: 20, timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(200)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    first.resolve(new Response('{"online":true}'))
    await vi.advanceTimersByTimeAsync(0)
    expect(callback).toHaveBeenCalledWith({ online: true })
    await vi.advanceTimersByTimeAsync(20)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    unsubscribe()
    expect(mocks.fetch.mock.calls[1][1].signal.aborted).toBe(true)
    second.resolve(new Response('{"online":false}'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports an HTTP error and retries without a direct database fallback', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('{"error":"Unavailable"}', { status: 503 }))
    const callback = vi.fn()
    const error = vi.fn()
    const unsubscribe = subscribeToPresence('player-1', callback, error, { intervalMs: 20 })
    await vi.advanceTimersByTimeAsync(0)
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unavailable', status: 503 }))
    expect(callback).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20)
    expect(callback).toHaveBeenCalledWith({ online: true })
    unsubscribe()
    expect(mocks.ref).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('supports an external abort signal before startup or while waiting for the next poll', async () => {
    const preAbort = new AbortController()
    preAbort.abort()
    subscribeToPresence('player-1', vi.fn(), vi.fn(), { signal: preAbort.signal })()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.fetch).not.toHaveBeenCalled()
    const controller = new AbortController()
    const unsubscribe = subscribeToPresence('player-1', vi.fn(), vi.fn(), { signal: controller.signal })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    unsubscribe()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles a consumer throwing from its error callback without an unhandled promise', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.fetch.mockRejectedValueOnce(new Error('Network failure'))
    const unsubscribe = subscribeToPresence('player-1', vi.fn(), () => { throw new Error('Consumer failure') })
    await vi.advanceTimersByTimeAsync(0)
    expect(log).toHaveBeenCalledWith('The presence error callback failed.')
    unsubscribe()
    log.mockRestore()
  })

  it('rejects invalid uid/callback/poll timer inputs', () => {
    expect(() => subscribeToPresence('bad/uid', vi.fn())).toThrow('Firebase key')
    expect(() => subscribeToPresence('player', null as never)).toThrow('callback')
    for (const intervalMs of [0, -1, Infinity, NaN, 2_147_483_648]) {
      expect(() => subscribeToPresence('player', vi.fn(), undefined, { intervalMs })).toThrow('intervalMs')
    }
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
