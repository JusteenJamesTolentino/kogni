import { AdminConfigurationError, ADMIN_CONFIG_MESSAGE } from '../../../src/lib/firebase-admin'
import { SocialError, SOCIAL_UNAVAILABLE_MESSAGE } from '../../../functions/src/social-core'
import { AuthenticationError } from './auth'
import { ServiceUnavailableError, SERVICE_UNAVAILABLE_MESSAGE } from './database'
import { QuizServiceError } from './quiz-service'

export const PRIVATE_RESPONSE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }
export const MAX_JSON_BODY_BYTES = 64 * 1024

export class InputError extends Error {
  constructor() { super('Invalid request.') }
}

export async function readJson(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  const declaredLength = Number(request.headers.get('content-length'))
  if (
    contentType !== 'application/json' ||
    !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
    (Number.isFinite(declaredLength) && declaredLength > maxBytes)
  ) throw new InputError()
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new InputError()
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof InputError) throw error
    throw new InputError()
  }
}

export function jsonResult(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: { ...PRIVATE_RESPONSE_HEADERS, ...init?.headers },
  })
}

export function errorResponse(error: unknown): Response {
  let status = 503
  let message = SERVICE_UNAVAILABLE_MESSAGE
  if (error instanceof AdminConfigurationError) message = ADMIN_CONFIG_MESSAGE
  else if (error instanceof AuthenticationError) { status = 401; message = 'Authentication is required.' }
  else if (error instanceof InputError) { status = 400; message = 'Invalid request.' }
  else if (error instanceof QuizServiceError) {
    status = error.code === 'invalid-argument' ? 400
      : error.code === 'permission-denied' ? 403
        : error.code === 'not-found' ? 404
          : error.code === 'too-many-events' ? 429
            : 409
    message = error.message
  } else if (error instanceof SocialError) {
    if (error.code === 'invalid-argument') { status = 400; message = 'A valid target player is required.' }
    else if (error.code === 'unauthenticated') { status = 401; message = 'Authentication is required.' }
    else if (error.code === 'not-found') { status = 404; message = SOCIAL_UNAVAILABLE_MESSAGE }
  } else if (error instanceof ServiceUnavailableError) message = SERVICE_UNAVAILABLE_MESSAGE
  return Response.json({ error: message }, { status, headers: PRIVATE_RESPONSE_HEADERS })
}
