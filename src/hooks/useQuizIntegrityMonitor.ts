'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordQuizIntegrityEvents } from '../lib/quizzes'

type QuizIntegrityEvent = Parameters<typeof recordQuizIntegrityEvents>[0]['events'][number]
type QuizIntegrityEventType = QuizIntegrityEvent['type']
type MonitoredEpisodeType = Extract<
  QuizIntegrityEventType,
  'page-hidden' | 'fullscreen-ended' | 'connection-interrupted'
>

const PAGE_INACTIVE_EVENT_TYPE: MonitoredEpisodeType = 'page-hidden'
const FULLSCREEN_ENDED_EVENT_TYPE: MonitoredEpisodeType = 'fullscreen-ended'
const CONNECTION_INTERRUPTED_EVENT_TYPE: MonitoredEpisodeType = 'connection-interrupted'
const INTEGRITY_EVENT_TYPES = new Set<QuizIntegrityEventType>([
  PAGE_INACTIVE_EVENT_TYPE,
  FULLSCREEN_ENDED_EVENT_TYPE,
  CONNECTION_INTERRUPTED_EVENT_TYPE,
  'session-replaced',
  'monitoring-limited',
])

const PAGE_INACTIVE_MINIMUM_MS = 2_000
const FULLSCREEN_ENDED_MINIMUM_MS = 2_000
const CONNECTION_INTERRUPTED_MINIMUM_MS = 5_000
const MAX_QUEUED_EVENTS = 20
const MAX_STORED_PAYLOAD_LENGTH = 32_768
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const QUESTION_ID_PATTERN = /^q_[0-9]{1,3}$/
const STORAGE_PREFIX = 'kognit:quiz-integrity:v1'
const RESOLVED_PROMISE = Promise.resolve()

/** Neutral UI copy; the host UI owns any dismissal timer. */
export const QUIZ_INTEGRITY_RETURN_WARNING = 'Quiz monitoring resumed after an interruption.'

export interface UseQuizIntegrityMonitorOptions {
  /** Whether this quiz opted in to Integrity Mode. */
  enabled: boolean
  /** Whether the timed attempt is currently accepting answers. */
  active: boolean
  quizId: string
  attemptId: string
  sessionId: string
  /** The server-issued q_N identifier, if a question is currently displayed. */
  currentQuestionId?: string | null
  /** True only when this attempt successfully entered fullscreen at startup. */
  fullscreenWasEntered: boolean
  /** Called only after an eligible interruption episode closes. */
  onWarning?: (message: string) => void
  /** Called for storage, fullscreen-request, or delivery failures. */
  onError?: (error: Error) => void
}

export interface QuizIntegrityMonitor {
  /** A neutral post-return message, or null when it has been dismissed. */
  returnWarning: string | null
  clearReturnWarning(): void
  /** Requests fullscreen from a user gesture. Fullscreen is never requested automatically. */
  reenterFullscreen(): Promise<boolean>
  /** Tries to deliver the current queue. Failures remain queued and are reported via onError. */
  flush(): Promise<void>
  /** Finalizes open eligible episodes, detaches listeners, and makes one delivery attempt. */
  stop(): Promise<void>
}

interface OpenEpisode {
  startedAt: number
  questionId?: string
}

interface VisibilitySnapshot {
  hidden: boolean
  visible: boolean
}

interface IntegrityMonitorRuntimeOptions {
  quizId: string
  attemptId: string
  sessionId: string
  storageKey: string
  getCurrentQuestionId(): string | null | undefined
  notifyWarning(message: string): void
  reportError(error: Error): void
}

interface IntegrityMonitorRuntime {
  readonly storageKey: string
  attach(): void
  detach(): void
  enableFullscreenTracking(): void
  reenterFullscreen(): Promise<boolean>
  flush(): Promise<void>
  stop(): Promise<void>
}

interface StoredQueuePayload {
  version: 1
  nextSequence: number
  events: QuizIntegrityEvent[]
}

function storageKeyFor(quizId: string, attemptId: string, sessionId: string): string {
  return [STORAGE_PREFIX, quizId, attemptId, sessionId].map(encodeURIComponent).join(':')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hasOnlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key))
}

function parseStoredEvent(value: unknown): QuizIntegrityEvent | null {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ['eventId', 'type', 'startedAt', 'sequence'],
    ['endedAt', 'questionId'],
  )) return null

  if (
    typeof value.eventId !== 'string' || !EVENT_ID_PATTERN.test(value.eventId) ||
    typeof value.type !== 'string' || !INTEGRITY_EVENT_TYPES.has(value.type as QuizIntegrityEventType) ||
    !isSafeNonnegativeInteger(value.startedAt) ||
    !isSafeNonnegativeInteger(value.sequence)
  ) return null

  if (
    value.endedAt !== undefined &&
    (!isSafeNonnegativeInteger(value.endedAt) || value.endedAt < value.startedAt)
  ) return null
  if (
    value.questionId !== undefined &&
    (typeof value.questionId !== 'string' || !QUESTION_ID_PATTERN.test(value.questionId))
  ) return null

  return {
    eventId: value.eventId,
    type: value.type as QuizIntegrityEventType,
    startedAt: value.startedAt,
    ...(value.endedAt === undefined ? {} : { endedAt: value.endedAt }),
    ...(value.questionId === undefined ? {} : { questionId: value.questionId }),
    sequence: value.sequence,
  }
}

function parseStoredPayload(value: unknown): { events: unknown[]; nextSequence?: number } | null {
  if (Array.isArray(value)) return { events: value }
  if (!isRecord(value) || !Array.isArray(value.events)) return null
  if (!hasOnlyKeys(value, ['events'], ['version', 'nextSequence'])) return null
  if (value.version !== undefined && value.version !== 1) return null
  if (value.nextSequence !== undefined && !isSafeNonnegativeInteger(value.nextSequence)) return null
  return {
    events: value.events,
    ...(value.nextSequence === undefined ? {} : { nextSequence: value.nextSequence }),
  }
}

function readVisibility(): VisibilitySnapshot {
  const state: unknown = document.visibilityState
  if (state === 'hidden') return { hidden: true, visible: false }
  if (state === 'visible') return { hidden: false, visible: true }
  return { hidden: false, visible: false }
}

function readFocus(): boolean {
  try {
    return typeof document.hasFocus !== 'function' || document.hasFocus()
  } catch {
    return true
  }
}

function readOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function currentTimestamp(): number {
  const timestamp = Date.now()
  if (!isSafeNonnegativeInteger(timestamp)) throw new Error('Quiz monitoring could not read a valid timestamp.')
  return timestamp
}

function toError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback)
}

function cryptoUuid(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi) throw new Error('Secure event identifiers are not available in this browser.')
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Secure event identifiers are not available in this browser.')
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function createEventId(): string {
  const eventId = `quiz_event_${cryptoUuid()}`
  if (!EVENT_ID_PATTERN.test(eventId)) {
    throw new Error('A bounded quiz monitoring event identifier could not be created.')
  }
  return eventId
}

function openEpisodeAt(startedAt: number, questionId: string | undefined): OpenEpisode {
  return {
    startedAt,
    ...(questionId === undefined ? {} : { questionId }),
  }
}

function createIntegrityMonitorRuntime(options: IntegrityMonitorRuntimeOptions): IntegrityMonitorRuntime {
  let attached = false
  let terminal = false
  let stopping = false
  let fullscreenTrackingEnabled = false
  let storageRestored = false
  let storage: Storage | null = null
  let storageErrorReported = false
  let queueLimitReported = false
  let nextSequence = 0
  let queue: QuizIntegrityEvent[] = []
  let flushPromise: Promise<void> | null = null
  let stopPromise: Promise<void> | null = null

  let pageHidden = false
  let pageVisible = false
  let windowFocused = true
  let browserOnline = true
  let pageEpisode: OpenEpisode | null = null
  let fullscreenEpisode: OpenEpisode | null = null
  let connectionEpisode: OpenEpisode | null = null

  const safelyReport = (value: unknown, fallback: string): void => {
    const error = toError(value, fallback)
    try {
      options.reportError(error)
    } catch {
      console.error('The quiz monitoring error callback failed.')
    }
  }

  const reportStorageError = (value: unknown): void => {
    if (storageErrorReported) return
    storageErrorReported = true
    safelyReport(value, 'Quiz monitoring events could not be stored in this browser session.')
  }

  const storedPayload = (): StoredQueuePayload => ({
    version: 1,
    nextSequence,
    events: queue.map((event) => ({ ...event })),
  })

  const disableStorage = (value: unknown): void => {
    storage = null
    reportStorageError(value)
  }

  const removeStoredQueue = (): void => {
    if (!storage) return
    try {
      storage.removeItem(options.storageKey)
    } catch (error: unknown) {
      disableStorage(error)
    }
  }

  const persistQueue = (): void => {
    if (!storage) return
    if ((terminal || !stopping) && queue.length === 0) {
      removeStoredQueue()
      return
    }
    try {
      storage.setItem(options.storageKey, JSON.stringify(storedPayload()))
    } catch (error: unknown) {
      disableStorage(error)
    }
  }

  const restoreQueue = (): void => {
    if (storageRestored) return
    storageRestored = true
    try {
      storage = window.sessionStorage
    } catch (error: unknown) {
      disableStorage(error)
      return
    }

    let raw: string | null
    try {
      raw = storage.getItem(options.storageKey)
    } catch (error: unknown) {
      disableStorage(error)
      return
    }
    if (raw === null) return
    if (raw.length > MAX_STORED_PAYLOAD_LENGTH) {
      removeStoredQueue()
      reportStorageError(new Error('Stored quiz monitoring events exceeded the local size limit.'))
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      removeStoredQueue()
      reportStorageError(new Error('Stored quiz monitoring events were unreadable.'))
      return
    }
    const payload = parseStoredPayload(parsed)
    if (!payload) {
      removeStoredQueue()
      reportStorageError(new Error('Stored quiz monitoring events were invalid.'))
      return
    }

    const restored: QuizIntegrityEvent[] = []
    const eventIds = new Set<string>()
    const sequences = new Set<number>()
    let greatestObservedSequence = -1
    for (const candidate of payload.events) {
      const event = parseStoredEvent(candidate)
      if (!event || eventIds.has(event.eventId) || sequences.has(event.sequence)) continue
      eventIds.add(event.eventId)
      sequences.add(event.sequence)
      greatestObservedSequence = Math.max(greatestObservedSequence, event.sequence)
      restored.push(event)
    }
    restored.sort((left, right) => left.sequence - right.sequence)
    queue = restored.slice(0, MAX_QUEUED_EVENTS)
    const derivedNextSequence = greatestObservedSequence >= MAX_SEQUENCE
      ? MAX_SEQUENCE
      : greatestObservedSequence + 1
    nextSequence = Math.max(payload.nextSequence ?? 0, derivedNextSequence)
    if (nextSequence > MAX_SEQUENCE) nextSequence = MAX_SEQUENCE
    persistQueue()
  }

  const currentQuestionId = (): string | undefined => {
    const value = options.getCurrentQuestionId()
    return typeof value === 'string' && QUESTION_ID_PATTERN.test(value) ? value : undefined
  }

  const openEpisode = (startedAt: number): OpenEpisode =>
    openEpisodeAt(startedAt, currentQuestionId())

  const canAutomaticallyFlush = (): boolean =>
    attached && pageVisible && windowFocused && browserOnline && readOnline()

  const enqueueClosedEpisode = (
    type: MonitoredEpisodeType,
    episode: OpenEpisode,
    endedAt: number,
    minimumDurationMs: number,
  ): boolean => {
    if (endedAt < episode.startedAt) {
      safelyReport(new Error('Quiz monitoring observed the system clock moving backwards.'), '')
      return false
    }
    if (endedAt - episode.startedAt < minimumDurationMs) return false

    let queued = false
    if (queue.length >= MAX_QUEUED_EVENTS) {
      if (!queueLimitReported) {
        queueLimitReported = true
        safelyReport(new Error('Quiz monitoring reached its local event queue limit.'), '')
      }
    } else if (nextSequence >= MAX_SEQUENCE) {
      safelyReport(new Error('Quiz monitoring reached its local sequence limit.'), '')
    } else {
      try {
        const event: QuizIntegrityEvent = {
          eventId: createEventId(),
          type,
          startedAt: episode.startedAt,
          endedAt,
          ...(episode.questionId === undefined ? {} : { questionId: episode.questionId }),
          sequence: nextSequence,
        }
        nextSequence += 1
        queue.push(event)
        persistQueue()
        queued = true
      } catch (error: unknown) {
        safelyReport(error, 'A quiz monitoring event could not be queued.')
      }
    }

    try {
      options.notifyWarning(QUIZ_INTEGRITY_RETURN_WARNING)
    } catch {
      safelyReport(new Error('The quiz monitoring warning callback failed.'), '')
    }
    return queued
  }

  const runFlush = async (): Promise<void> => {
    while (queue.length > 0 && readOnline()) {
      const batch = queue.slice(0, MAX_QUEUED_EVENTS).map((event) => ({ ...event }))
      const submittedIds = new Set(batch.map((event) => event.eventId))
      const response = await recordQuizIntegrityEvents({
        quizId: options.quizId,
        attemptId: options.attemptId,
        sessionId: options.sessionId,
        events: batch,
      })
      const acceptedIds = new Set(
        Array.isArray(response.acceptedEventIds)
          ? response.acceptedEventIds.filter((eventId) => submittedIds.has(eventId))
          : [],
      )
      if (acceptedIds.size === 0) {
        safelyReport(new Error('Quiz monitoring events were not acknowledged.'), '')
        return
      }

      queue = queue.filter((event) => !acceptedIds.has(event.eventId))
      queueLimitReported = false
      persistQueue()
      if (acceptedIds.size < batch.length) return
    }
  }

  const flush = (): Promise<void> => {
    if (flushPromise) return flushPromise
    if (queue.length === 0 || !readOnline()) return RESOLVED_PROMISE

    const operation = runFlush()
    let sharedPromise: Promise<void>
    sharedPromise = operation
      .catch((error: unknown) => {
        safelyReport(error, 'Quiz monitoring events could not be delivered.')
      })
      .finally(() => {
        if (flushPromise === sharedPromise) flushPromise = null
      })
    flushPromise = sharedPromise
    return sharedPromise
  }

  const flushAutomatically = (): void => {
    if (!canAutomaticallyFlush() || queue.length === 0) return
    if (flushPromise) return
    void flush()
  }

  const closePageEpisode = (endedAt: number, automaticallyFlush = true): void => {
    const episode = pageEpisode
    pageEpisode = null
    if (
      episode &&
      enqueueClosedEpisode(PAGE_INACTIVE_EVENT_TYPE, episode, endedAt, PAGE_INACTIVE_MINIMUM_MS) &&
      automaticallyFlush
    ) flushAutomatically()
  }

  const closeFullscreenEpisode = (endedAt: number, automaticallyFlush = true): void => {
    const episode = fullscreenEpisode
    fullscreenEpisode = null
    if (
      episode &&
      enqueueClosedEpisode(FULLSCREEN_ENDED_EVENT_TYPE, episode, endedAt, FULLSCREEN_ENDED_MINIMUM_MS) &&
      automaticallyFlush
    ) flushAutomatically()
  }

  const closeConnectionEpisode = (endedAt: number, automaticallyFlush = true): void => {
    const episode = connectionEpisode
    connectionEpisode = null
    if (episode && enqueueClosedEpisode(
      CONNECTION_INTERRUPTED_EVENT_TYPE,
      episode,
      endedAt,
      CONNECTION_INTERRUPTED_MINIMUM_MS,
    ) && automaticallyFlush) flushAutomatically()
  }

  const reconcilePageActivity = (observedAt: number): void => {
    if (pageHidden || !windowFocused) {
      pageEpisode ??= openEpisode(observedAt)
      return
    }
    if (pageVisible && windowFocused && pageEpisode) closePageEpisode(observedAt)
  }

  const handleVisibilityChange = (): void => {
    const visibility = readVisibility()
    pageHidden = visibility.hidden
    pageVisible = visibility.visible
    let observedAt: number
    try {
      observedAt = currentTimestamp()
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe page visibility.')
      return
    }
    reconcilePageActivity(observedAt)
    if (pageVisible && windowFocused) flushAutomatically()
  }

  const handleBlur = (): void => {
    windowFocused = false
    try {
      reconcilePageActivity(currentTimestamp())
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe page focus.')
    }
  }

  const handleFocus = (): void => {
    windowFocused = true
    try {
      reconcilePageActivity(currentTimestamp())
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe page focus.')
      return
    }
    flushAutomatically()
  }

  const handleFullscreenChange = (): void => {
    if (!fullscreenTrackingEnabled) return
    let observedAt: number
    try {
      observedAt = currentTimestamp()
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe fullscreen state.')
      return
    }
    if (document.fullscreenElement == null) {
      fullscreenEpisode ??= openEpisode(observedAt)
    } else if (fullscreenEpisode) {
      closeFullscreenEpisode(observedAt)
    }
  }

  const handleOffline = (): void => {
    browserOnline = false
    try {
      connectionEpisode ??= openEpisode(currentTimestamp())
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe connection state.')
    }
  }

  const handleOnline = (): void => {
    browserOnline = true
    try {
      if (connectionEpisode) closeConnectionEpisode(currentTimestamp())
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe connection state.')
      return
    }
    flushAutomatically()
  }

  const addListeners = (): void => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
  }

  const removeListeners = (): void => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('blur', handleBlur)
    window.removeEventListener('focus', handleFocus)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
  }

  const attach = (): void => {
    if (attached || terminal || stopping) return
    restoreQueue()
    const visibility = readVisibility()
    pageHidden = visibility.hidden
    pageVisible = visibility.visible
    windowFocused = readFocus()
    browserOnline = readOnline()
    let observedAt: number
    try {
      observedAt = currentTimestamp()
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not start.')
      return
    }

    attached = true
    addListeners()
    reconcilePageActivity(observedAt)
    if (!browserOnline) connectionEpisode = openEpisode(observedAt)
    flushAutomatically()
  }

  const detach = (): void => {
    if (!attached) return
    removeListeners()
    attached = false
  }

  const enableFullscreenTracking = (): void => {
    if (fullscreenTrackingEnabled || terminal || stopping) return
    fullscreenTrackingEnabled = true
    if (!attached || document.fullscreenElement != null) return
    try {
      fullscreenEpisode ??= openEpisode(currentTimestamp())
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not observe fullscreen state.')
    }
  }

  const reenterFullscreen = async (): Promise<boolean> => {
    if (!attached || terminal || stopping || !fullscreenTrackingEnabled) return false
    if (document.fullscreenElement != null) return true
    const target = document.documentElement
    const requestFullscreen = target.requestFullscreen
    if (typeof requestFullscreen !== 'function') {
      safelyReport(new Error('Fullscreen is not available in this browser.'), '')
      return false
    }
    try {
      await requestFullscreen.call(target)
      return true
    } catch (error: unknown) {
      safelyReport(error, 'Fullscreen could not be requested.')
      return false
    }
  }

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise
    stopping = true
    let resolveStop!: () => void
    stopPromise = new Promise<void>((resolve) => { resolveStop = resolve })

    let observedAt: number
    try {
      observedAt = currentTimestamp()
    } catch (error: unknown) {
      safelyReport(error, 'Quiz monitoring could not stop cleanly.')
      observedAt = 0
    }

    if (attached) {
      removeListeners()
      attached = false
    }
    if (observedAt > 0) {
      if (pageEpisode) closePageEpisode(observedAt, false)
      if (fullscreenEpisode) closeFullscreenEpisode(observedAt, false)
      if (connectionEpisode) closeConnectionEpisode(observedAt, false)
    }
    pageEpisode = null
    fullscreenEpisode = null
    connectionEpisode = null

    const pendingFlush = flushPromise ?? flush()
    void pendingFlush.finally(() => {
      stopping = false
      terminal = true
      persistQueue()
      resolveStop()
    })
    return stopPromise
  }

  return {
    storageKey: options.storageKey,
    attach,
    detach,
    enableFullscreenTracking,
    reenterFullscreen,
    flush,
    stop,
  }
}

/**
 * Collects bounded browser interruption episodes for an active Integrity Mode quiz.
 * It never pauses quiz timing and never records input, device, network-address, or verdict data.
 */
export function useQuizIntegrityMonitor({
  enabled,
  active,
  quizId,
  attemptId,
  sessionId,
  currentQuestionId,
  fullscreenWasEntered,
  onWarning,
  onError,
}: UseQuizIntegrityMonitorOptions): QuizIntegrityMonitor {
  const [warningState, setWarningState] = useState<{
    storageKey: string
    message: string
  } | null>(null)
  const renderValuesRef = useRef({
    currentQuestionId,
    onWarning,
    onError,
    operational: enabled && active,
  })
  useEffect(() => {
    renderValuesRef.current = {
      currentQuestionId,
      onWarning,
      onError,
      operational: enabled && active,
    }
  })
  const runtimeRef = useRef<IntegrityMonitorRuntime | null>(null)
  const mountedRef = useRef(false)
  const storageKey = storageKeyFor(quizId, attemptId, sessionId)
  const returnWarning = warningState?.storageKey === storageKey ? warningState.message : null

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const runtime = runtimeRef.current
      runtimeRef.current = null
      if (runtime) void runtime.stop()
    }
  }, [])

  useEffect(() => {
    if (!enabled || !active) {
      const runtime = runtimeRef.current
      runtimeRef.current = null
      if (runtime) void runtime.stop()
      return
    }

    let runtime = runtimeRef.current
    if (!runtime || runtime.storageKey !== storageKey) {
      if (runtime) void runtime.stop()
      runtime = createIntegrityMonitorRuntime({
        quizId,
        attemptId,
        sessionId,
        storageKey,
        getCurrentQuestionId: () => renderValuesRef.current.currentQuestionId,
        notifyWarning: (message) => {
          if (!mountedRef.current || runtimeRef.current !== runtime) return
          setWarningState({ storageKey, message })
          const callback = renderValuesRef.current.onWarning
          if (!callback) return
          try {
            callback(message)
          } catch {
            const errorCallback = renderValuesRef.current.onError
            if (errorCallback) {
              try {
                errorCallback(new Error('The quiz monitoring warning callback failed.'))
              } catch {
                console.error('The quiz monitoring error callback failed.')
              }
            }
          }
        },
        reportError: (error) => {
          if (!mountedRef.current || runtimeRef.current !== runtime) return
          const callback = renderValuesRef.current.onError
          if (callback) {
            try {
              callback(error)
            } catch {
              console.error('The quiz monitoring error callback failed.')
            }
          } else {
            console.error('Quiz monitoring could not complete an operation.', error)
          }
        },
      })
      runtimeRef.current = runtime
    }

    runtime.attach()
    return () => { runtime.detach() }
  }, [active, attemptId, enabled, quizId, sessionId, storageKey])

  useEffect(() => {
    if (enabled && active && fullscreenWasEntered) {
      runtimeRef.current?.enableFullscreenTracking()
    }
  }, [active, enabled, fullscreenWasEntered, storageKey])

  useEffect(() => {
    if (!enabled || !active) return
    const handlePageHide = (): void => { void runtimeRef.current?.stop() }
    window.addEventListener('pagehide', handlePageHide)
    return () => { window.removeEventListener('pagehide', handlePageHide) }
  }, [active, enabled, storageKey])

  const clearReturnWarning = useCallback((): void => setWarningState(null), [])
  const reenterFullscreen = useCallback((): Promise<boolean> =>
    runtimeRef.current?.reenterFullscreen() ?? Promise.resolve(false), [])
  const flush = useCallback((): Promise<void> => {
    if (!renderValuesRef.current.operational) return RESOLVED_PROMISE
    return runtimeRef.current?.flush() ?? RESOLVED_PROMISE
  }, [])
  const stop = useCallback((): Promise<void> =>
    runtimeRef.current?.stop() ?? RESOLVED_PROMISE, [])

  return useMemo(() => ({
    returnWarning,
    clearReturnWarning,
    reenterFullscreen,
    flush,
    stop,
  }), [clearReturnWarning, flush, reenterFullscreen, returnWarning, stop])
}

export default useQuizIntegrityMonitor
