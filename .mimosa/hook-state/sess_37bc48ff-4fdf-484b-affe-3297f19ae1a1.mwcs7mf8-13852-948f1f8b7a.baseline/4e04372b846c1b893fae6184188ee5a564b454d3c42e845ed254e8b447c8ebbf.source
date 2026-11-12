import { auth } from './firebase'
import { isRecord } from './errors'

export const API_REQUEST_TIMEOUT_MS = 10_000
const MAX_REQUEST_TIMEOUT_MS = 60_000

export type ApiRequestErrorCode =
  | 'authentication-required'
  | 'authentication-changed'
  | 'request-timeout'
  | 'http-error'
  | 'invalid-response'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ApiRequestErrorCode,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AuthenticatedRequestOptions extends ApiRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

function serverErrorMessage(value: unknown, status: number): string {
  if (isRecord(value)) {
    const message = typeof value.error === 'string'
      ? value.error
      : isRecord(value.error) ? value.error.message : value.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return `Request failed (HTTP ${status}).`
}

/** Keeps bearer tokens same-origin and bounds authentication, fetch, and body reading. */
export async function authenticatedRequest<T>(
  path: string,
  validate: (value: unknown) => value is T,
  options: AuthenticatedRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/api/') || Array.from(path).some((character) => character === '\\' || character.charCodeAt(0) <= 32)) {
    throw new TypeError('An application API path is required')
  }
  if (typeof validate !== 'function') throw new TypeError('A response validator is required')
  const timeoutMs = options.timeoutMs ?? API_REQUEST_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_REQUEST_TIMEOUT_MS) {
    throw new TypeError(`timeoutMs must be between 1 and ${MAX_REQUEST_TIMEOUT_MS}`)
  }
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('The request was aborted.', 'AbortError')
  }
  const user = auth.currentUser
  if (!user) throw new ApiRequestError('You must be signed in.', 'authentication-required')

  const controller = new AbortController()
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
  const abort = (reason: unknown) => {
    if (controller.signal.aborted) return
    controller.abort(reason)
    rejectAbort(reason)
  }
  const onAbort = () => abort(options.signal?.reason ?? new DOMException('The request was aborted.', 'AbortError'))
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    abort(new ApiRequestError('The request timed out. Please try again.', 'request-timeout'))
  }, timeoutMs)
  const ensureCurrentRequest = () => {
    controller.signal.throwIfAborted()
    if (auth.currentUser !== user) {
      throw new ApiRequestError('Authentication changed. Please try again.', 'authentication-changed')
    }
  }

  try {
    return await Promise.race([
      aborted,
      (async () => {
        const token = await user.getIdToken()
        ensureCurrentRequest()
        if (!token) throw new ApiRequestError('You must be signed in.', 'authentication-required')
        const headers: Record<string, string> = {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        }
        if (options.body !== undefined) headers['content-type'] = 'application/json'
        const response = await fetch(path, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: controller.signal,
          cache: 'no-store',
          redirect: 'error',
        })
        ensureCurrentRequest()
        const text = await response.text()
        ensureCurrentRequest()
        let value: unknown
        try {
          value = JSON.parse(text)
        } catch {
          if (!response.ok) {
            throw new ApiRequestError(serverErrorMessage(null, response.status), 'http-error', response.status)
          }
          throw new ApiRequestError('The server returned invalid JSON.', 'invalid-response', response.status)
        }
        if (!response.ok) {
          throw new ApiRequestError(serverErrorMessage(value, response.status), 'http-error', response.status)
        }
        if (!validate(value)) {
          throw new ApiRequestError('The server returned an invalid response.', 'invalid-response', response.status)
        }
        return value
      })(),
    ])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
