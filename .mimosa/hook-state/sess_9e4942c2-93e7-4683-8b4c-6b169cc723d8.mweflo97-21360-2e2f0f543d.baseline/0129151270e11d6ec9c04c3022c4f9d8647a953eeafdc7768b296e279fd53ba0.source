import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; getIdToken: ReturnType<typeof vi.fn> } },
  fetch: vi.fn(),
}))
vi.mock('../../src/lib/firebase', () => ({ auth: mocks.auth }))

import { API_REQUEST_TIMEOUT_MS, authenticatedRequest } from '../../src/lib/vercel-api'

const isResult = (value: unknown): value is { ok: true } => (
  typeof value === 'object' && value !== null && 'ok' in value && value.ok === true
)
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.auth.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('test-token') }
  mocks.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('authenticated browser request', () => {
  it('uses same-origin bearer auth, JSON POST, no cache, and a finite abortable request', async () => {
    expect(await authenticatedRequest('/api/social/follow', isResult, { method: 'POST', body: { uid: 'player' } })).toEqual({ ok: true })
    expect(mocks.fetch).toHaveBeenCalledWith('/api/social/follow', expect.objectContaining({
      method: 'POST',
      headers: { authorization: 'Bearer test-token', accept: 'application/json', 'content-type': 'application/json' },
      body: '{"uid":"player"}',
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never fetches without an authenticated user or token', async () => {
    mocks.auth.currentUser = null
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'authentication-required' })
    mocks.auth.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('') }
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'authentication-required' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each(['https://example.test/api/test', '//example.test/api/test', '/api/\\example.test', '/api/test\n'])('rejects unsafe bearer destinations %j', async (path) => {
    await expect(authenticatedRequest(path, isResult)).rejects.toThrow('API path')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([0, -1, Infinity, NaN, 60_001])('rejects unbounded timeout %j', async (timeoutMs) => {
    await expect(authenticatedRequest('/api/test', isResult, { timeoutMs })).rejects.toThrow('timeoutMs')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('bounds token acquisition and does not fetch after a timed-out token finally resolves', async () => {
    const token = deferred<string>()
    mocks.auth.currentUser!.getIdToken.mockReturnValue(token.promise)
    const result = authenticatedRequest('/api/test', isResult)
    const assertion = expect(result).rejects.toMatchObject({ code: 'request-timeout' })
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS)
    await assertion
    token.resolve('late-token')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a fetch implementation that ignores its abort signal', async () => {
    mocks.fetch.mockReturnValue(new Promise(() => undefined))
    const result = authenticatedRequest('/api/test', isResult, { timeoutMs: 50 })
    const assertion = expect(result).rejects.toMatchObject({ code: 'request-timeout' })
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('bounds stalled response body reading', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, text: () => new Promise(() => undefined) })
    const result = authenticatedRequest('/api/test', isResult, { timeoutMs: 25 })
    const assertion = expect(result).rejects.toMatchObject({ code: 'request-timeout' })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it('handles pre-abort, in-flight abort, and listener cleanup', async () => {
    const preAbort = new AbortController()
    preAbort.abort()
    await expect(authenticatedRequest('/api/test', isResult, { signal: preAbort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.fetch).not.toHaveBeenCalled()
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    mocks.fetch.mockReturnValue(new Promise(() => undefined))
    const result = authenticatedRequest('/api/test', isResult, { signal: controller.signal })
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects token and response work belonging to a previous auth session', async () => {
    const token = deferred<string>()
    mocks.auth.currentUser!.getIdToken.mockReturnValue(token.promise)
    const result = authenticatedRequest('/api/test', isResult)
    mocks.auth.currentUser = { uid: 'other', getIdToken: vi.fn() }
    token.resolve('test-token')
    await expect(result).rejects.toMatchObject({ code: 'authentication-changed' })
    expect(mocks.fetch).not.toHaveBeenCalled()
    const response = deferred<Response>()
    mocks.auth.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('token') }
    mocks.fetch.mockReturnValue(response.promise)
    const responseResult = authenticatedRequest('/api/test', isResult)
    await vi.advanceTimersByTimeAsync(0)
    mocks.auth.currentUser = null
    response.resolve(new Response('{"ok":true}'))
    await expect(responseResult).rejects.toMatchObject({ code: 'authentication-changed' })
  })

  it.each([
    [{ error: 'Player unavailable.' }, 'Player unavailable.'],
    [{ error: { message: 'Service unavailable.' } }, 'Service unavailable.'],
    [{ message: 'Denied.' }, 'Denied.'],
    [{ error: '' }, 'Request failed (HTTP 503).'],
  ])('propagates structured server errors without losing status', async (body, message) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 503 }))
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'http-error', status: 503, message })
  })

  it.each(['', '<html>Unavailable</html>', '{broken'])('handles non-JSON failure responses without exposing the raw body', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(body, { status: 502 }))
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'http-error', status: 502, message: 'Request failed (HTTP 502).' })
  })

  it.each(['', '<html>OK</html>', '{broken'])('rejects invalid success JSON %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(body))
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'invalid-response', message: 'The server returned invalid JSON.' })
  })

  it.each([null, [], {}, { ok: false }])('validates decoded success data %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('propagates token, network, and body-reader errors and cleans the timer', async () => {
    const failure = new Error('Network interrupted')
    mocks.auth.currentUser!.getIdToken.mockRejectedValueOnce(failure)
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toBe(failure)
    mocks.fetch.mockRejectedValueOnce(failure)
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toBe(failure)
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: vi.fn().mockRejectedValue(failure) })
    await expect(authenticatedRequest('/api/test', isResult)).rejects.toBe(failure)
    expect(vi.getTimerCount()).toBe(0)
  })
})
