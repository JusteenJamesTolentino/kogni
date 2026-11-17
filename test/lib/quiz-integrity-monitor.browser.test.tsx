// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordQuizIntegrityEvents: vi.fn(),
}))

vi.mock('../../src/lib/quizzes', () => ({
  recordQuizIntegrityEvents: mocks.recordQuizIntegrityEvents,
}))

import {
  QUIZ_INTEGRITY_RETURN_WARNING,
  useQuizIntegrityMonitor,
} from '../../src/hooks/useQuizIntegrityMonitor'
import type { UseQuizIntegrityMonitorOptions } from '../../src/hooks/useQuizIntegrityMonitor'

type RecordedEvent = Parameters<typeof mocks.recordQuizIntegrityEvents>[0]['events'][number]

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z').getTime()
const defaultOptions: UseQuizIntegrityMonitorOptions = {
  enabled: true,
  active: true,
  quizId: 'quiz_monitor',
  attemptId: 'attempt_monitor',
  sessionId: 'session_monitor',
  currentQuestionId: 'q_0',
  fullscreenWasEntered: false,
}

let visibilityState: DocumentVisibilityState = 'visible'
let focused = true
let online = true
let fullscreenElement: Element | null = null
let requestFullscreen: ReturnType<typeof vi.fn>
let uuidIndex = 0
let documentAdds: ReturnType<typeof vi.spyOn>
let documentRemoves: ReturnType<typeof vi.spyOn>
let windowAdds: ReturnType<typeof vi.spyOn>
let windowRemoves: ReturnType<typeof vi.spyOn>

function acceptedResponse(input: Parameters<typeof mocks.recordQuizIntegrityEvents>[0]) {
  return Promise.resolve({
    acceptedEventIds: input.events.map((event: RecordedEvent) => event.eventId),
    serverNow: Date.now(),
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
  })
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

function dispatchDocument(type: string): void {
  act(() => { document.dispatchEvent(new Event(type)) })
}

function dispatchWindow(type: string): void {
  act(() => { window.dispatchEvent(new Event(type)) })
}

function setVisibility(state: DocumentVisibilityState): void {
  visibilityState = state
  dispatchDocument('visibilitychange')
}

function setFocus(value: boolean): void {
  focused = value
  dispatchWindow(value ? 'focus' : 'blur')
}

function setOnline(value: boolean): void {
  online = value
  dispatchWindow(value ? 'online' : 'offline')
}

function setFullscreen(value: Element | null): void {
  fullscreenElement = value
  dispatchDocument('fullscreenchange')
}

function renderMonitor(
  options: Partial<UseQuizIntegrityMonitorOptions> = {},
  wrapper?: (props: { children: ReactNode }) => ReactNode,
) {
  let current = { ...defaultOptions, ...options }
  const rendered = renderHook(
    ({ value }: { value: UseQuizIntegrityMonitorOptions }) => useQuizIntegrityMonitor(value),
    { initialProps: { value: current }, ...(wrapper ? { wrapper } : {}) },
  )
  return {
    ...rendered,
    rerenderOptions(next: Partial<UseQuizIntegrityMonitorOptions>) {
      current = { ...current, ...next }
      rendered.rerender({ value: current })
    },
  }
}

function listenerDelta(
  addSpy: ReturnType<typeof vi.spyOn>,
  removeSpy: ReturnType<typeof vi.spyOn>,
  type: string,
): number {
  const callsOfType = (calls: readonly unknown[][]): number => calls.filter((call) => call[0] === type).length
  return callsOfType(addSpy.mock.calls) - callsOfType(removeSpy.mock.calls)
}

function submittedEvents(): RecordedEvent[] {
  return mocks.recordQuizIntegrityEvents.mock.calls.flatMap(([input]) => input.events as RecordedEvent[])
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  sessionStorage.clear()
  visibilityState = 'visible'
  focused = true
  online = true
  fullscreenElement = null
  uuidIndex = 0
  requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilityState })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibilityState === 'hidden' })
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => focused })
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  })
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () => `00000000-0000-4000-8000-${String(++uuidIndex).padStart(12, '0')}`,
  )
  documentAdds = vi.spyOn(document, 'addEventListener')
  documentRemoves = vi.spyOn(document, 'removeEventListener')
  windowAdds = vi.spyOn(window, 'addEventListener')
  windowRemoves = vi.spyOn(window, 'removeEventListener')
  mocks.recordQuizIntegrityEvents.mockReset().mockImplementation(acceptedResponse)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useQuizIntegrityMonitor browser lifecycle', () => {
  it('attaches exactly the six monitor listeners while enabled and active, then detaches them', () => {
    const monitor = renderMonitor()

    expect(listenerDelta(documentAdds, documentRemoves, 'visibilitychange')).toBe(1)
    expect(listenerDelta(documentAdds, documentRemoves, 'fullscreenchange')).toBe(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'blur')).toBe(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'focus')).toBe(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'offline')).toBe(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'online')).toBe(1)

    monitor.rerenderOptions({ active: false })
    for (const type of ['visibilitychange', 'fullscreenchange']) {
      expect(listenerDelta(documentAdds, documentRemoves, type)).toBe(0)
    }
    for (const type of ['blur', 'focus', 'offline', 'online']) {
      expect(listenerDelta(windowAdds, windowRemoves, type)).toBe(0)
    }
  })

  it('merges blur and hidden state into one page episode and closes only when visible and focused', async () => {
    const onWarning = vi.fn()
    const monitor = renderMonitor({ onWarning })

    setFocus(false)
    await advance(1_000)
    setVisibility('hidden')
    await advance(1_500)
    setVisibility('visible')
    await flushMicrotasks()
    expect(mocks.recordQuizIntegrityEvents).not.toHaveBeenCalled()

    await advance(500)
    setFocus(true)
    await flushMicrotasks()

    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    expect(submittedEvents()).toEqual([
      expect.objectContaining({
        type: 'page-hidden',
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 3_000,
        questionId: 'q_0',
        sequence: 0,
      }),
    ])
    expect(onWarning).toHaveBeenCalledOnce()
    expect(onWarning).toHaveBeenCalledWith(QUIZ_INTEGRITY_RETURN_WARNING)
    expect(monitor.result.current.returnWarning).toBe(QUIZ_INTEGRITY_RETURN_WARNING)
    act(() => { monitor.result.current.clearReturnWarning() })
    expect(monitor.result.current.returnWarning).toBeNull()
  })

  it('discards page and connection episodes below their thresholds without warnings', async () => {
    const onWarning = vi.fn()
    renderMonitor({ onWarning })

    setFocus(false)
    await advance(1_999)
    setFocus(true)
    setOnline(false)
    await advance(4_999)
    setOnline(true)
    await flushMicrotasks()

    expect(mocks.recordQuizIntegrityEvents).not.toHaveBeenCalled()
    expect(onWarning).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it('records a fullscreen exit only after a user-invoked successful re-entry', async () => {
    fullscreenElement = document.documentElement
    const monitor = renderMonitor({ fullscreenWasEntered: true })

    setFullscreen(null)
    await advance(2_000)
    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(mocks.recordQuizIntegrityEvents).not.toHaveBeenCalled()

    let reentered = false
    await act(async () => {
      reentered = await monitor.result.current.reenterFullscreen()
    })
    await flushMicrotasks()

    expect(reentered).toBe(true)
    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(submittedEvents()).toEqual([
      expect.objectContaining({
        type: 'fullscreen-ended',
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 2_000,
        sequence: 0,
      }),
    ])
  })

  it('keeps an eligible offline episode queued, then sends it after reconnect', async () => {
    const monitor = renderMonitor()

    setOnline(false)
    await advance(5_000)
    setOnline(true)
    await flushMicrotasks()

    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    const [submitted] = submittedEvents()
    expect(submitted.eventId).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
    expect(submitted).toEqual(expect.objectContaining({
      type: 'connection-interrupted',
      startedAt: BASE_TIME,
      endedAt: BASE_TIME + 5_000,
    }))
    expect(monitor.result.current.returnWarning).toBe(QUIZ_INTEGRITY_RETURN_WARNING)
    expect(sessionStorage.length).toBe(0)
  })

  it('serializes flush calls and makes stop idempotent while finalizing open episodes', async () => {
    online = false
    const pending = deferred<{ acceptedEventIds: string[]; serverNow: number }>()
    mocks.recordQuizIntegrityEvents.mockReset().mockReturnValue(pending.promise)
    const monitor = renderMonitor()

    await advance(5_000)
    online = true
    const firstStop = monitor.result.current.stop()
    const secondStop = monitor.result.current.stop()
    const manualFlush = monitor.result.current.flush()

    expect(secondStop).toBe(firstStop)
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    await flushMicrotasks()
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    const [sent] = submittedEvents()
    expect(sent).toEqual(expect.objectContaining({
      type: 'connection-interrupted',
      endedAt: BASE_TIME + 5_000,
    }))

    pending.resolve({ acceptedEventIds: [sent.eventId], serverNow: Date.now() })
    await act(async () => { await Promise.all([firstStop, secondStop, manualFlush]) })
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'online')).toBe(0)
  })

  it('restores only bounded valid session events and continues the sequence monotonically', async () => {
    const key = [
      'kognit:quiz-integrity:v1',
      defaultOptions.quizId,
      defaultOptions.attemptId,
      defaultOptions.sessionId,
    ].map(encodeURIComponent).join(':')
    const restoredId = 'quiz_event_00000000-0000-4000-8000-000000000099'
    sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      nextSequence: 8,
      events: [
        {
          eventId: restoredId,
          type: 'page-hidden',
          startedAt: BASE_TIME - 10_000,
          endedAt: BASE_TIME - 8_000,
          questionId: 'q_0',
          sequence: 7,
        },
        {
          eventId: 'bad/id',
          type: 'page-hidden',
          startedAt: BASE_TIME,
          endedAt: BASE_TIME + 2_000,
          sequence: 999,
          bearer: 'must-not-survive',
        },
      ],
      token: 'must-not-survive',
    }))
    // Strict payload validation rejects unknown top-level fields rather than persisting them.
    const invalidStorageError = vi.fn()
    renderMonitor({ onError: invalidStorageError })
    await flushMicrotasks()
    expect(mocks.recordQuizIntegrityEvents).not.toHaveBeenCalled()
    expect(invalidStorageError).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(key)).toBeNull()

    online = false
    sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      nextSequence: 8,
      events: [{
        eventId: restoredId,
        type: 'page-hidden',
        startedAt: BASE_TIME - 10_000,
        endedAt: BASE_TIME - 8_000,
        questionId: 'q_0',
        sequence: 7,
      }],
    }))
    cleanup()
    mocks.recordQuizIntegrityEvents.mockClear()
    const restored = renderMonitor()
    setFocus(false)
    await advance(2_000)
    setFocus(true)
    const persisted = JSON.parse(sessionStorage.getItem(key)!) as { events: RecordedEvent[] }
    expect(persisted.events.map((event) => event.sequence)).toEqual([7, 8])

    online = true
    await act(async () => { await restored.result.current.flush() })
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledOnce()
    expect(submittedEvents().map((event) => event.sequence)).toEqual([7, 8])
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('survives a StrictMode effect replay without duplicate listeners or events', async () => {
    const monitor = renderMonitor({}, ({ children }) => <StrictMode>{children}</StrictMode>)

    expect(listenerDelta(documentAdds, documentRemoves, 'visibilitychange')).toBe(1)
    expect(listenerDelta(windowAdds, windowRemoves, 'blur')).toBe(1)
    setFocus(false)
    await advance(2_000)
    setFocus(true)
    await flushMicrotasks()

    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    expect(submittedEvents()).toHaveLength(1)
    monitor.unmount()
    expect(listenerDelta(documentAdds, documentRemoves, 'visibilitychange')).toBe(0)
    expect(listenerDelta(windowAdds, windowRemoves, 'blur')).toBe(0)
  })

  it('never attaches listeners, requests fullscreen, or emits events while disabled', async () => {
    const monitor = renderMonitor({ enabled: false, fullscreenWasEntered: true })

    expect(listenerDelta(documentAdds, documentRemoves, 'visibilitychange')).toBe(0)
    expect(listenerDelta(documentAdds, documentRemoves, 'fullscreenchange')).toBe(0)
    expect(listenerDelta(windowAdds, windowRemoves, 'blur')).toBe(0)
    expect(listenerDelta(windowAdds, windowRemoves, 'online')).toBe(0)

    setFocus(false)
    setVisibility('hidden')
    setOnline(false)
    await advance(10_000)
    expect(await monitor.result.current.reenterFullscreen()).toBe(false)
    await monitor.result.current.flush()
    await monitor.result.current.stop()

    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(mocks.recordQuizIntegrityEvents).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it('batches at most 20 queued events', async () => {
    online = false
    const onError = vi.fn()
    const monitor = renderMonitor({ onError })
    for (let index = 0; index < 21; index += 1) {
      setFocus(false)
      await advance(2_000)
      setFocus(true)
    }

    expect(onError).toHaveBeenCalledOnce()
    online = true
    await act(async () => { await monitor.result.current.flush() })
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledOnce()
    expect(mocks.recordQuizIntegrityEvents.mock.calls[0][0].events).toHaveLength(20)
  })

  it('retries a failed persisted queue after visibility and focus restoration', async () => {
    mocks.recordQuizIntegrityEvents
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementation(acceptedResponse)
    const onError = vi.fn()
    renderMonitor({ onError })

    setFocus(false)
    await advance(2_000)
    setFocus(true)
    await flushMicrotasks()
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledOnce()
    expect(sessionStorage.length).toBe(1)

    setVisibility('hidden')
    setFocus(false)
    setVisibility('visible')
    setFocus(true)
    await flushMicrotasks()
    expect(mocks.recordQuizIntegrityEvents).toHaveBeenCalledTimes(2)
    expect(sessionStorage.length).toBe(0)
  })
})
