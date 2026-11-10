import { AdminConfigurationError, ADMIN_CONFIG_MESSAGE } from '../../../src/lib/firebase-admin'
import { SocialError, SOCIAL_UNAVAILABLE_MESSAGE } from '../../../functions/src/social-core'
import { AuthenticationError } from './auth'
import { ServiceUnavailableError, SERVICE_UNAVAILABLE_MESSAGE } from './database'

export const PRIVATE_RESPONSE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }

export class InputError extends Error {
  constructor() { super('Invalid request.') }
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json() } catch { throw new InputError() }
}

export function jsonResult(value: unknown): Response {
  return Response.json(value, { headers: PRIVATE_RESPONSE_HEADERS })
}

export function errorResponse(error: unknown): Response {
  let status = 503
  let message = SERVICE_UNAVAILABLE_MESSAGE
  if (error instanceof AdminConfigurationError) message = ADMIN_CONFIG_MESSAGE
  else if (error instanceof AuthenticationError) { status = 401; message = 'Authentication is required.' }
  else if (error instanceof InputError) { status = 400; message = 'Invalid request.' }
  else if (error instanceof SocialError) {
    if (error.code === 'invalid-argument') { status = 400; message = 'A valid target player is required.' }
    else if (error.code === 'unauthenticated') { status = 401; message = 'Authentication is required.' }
    else if (error.code === 'not-found') { status = 404; message = SOCIAL_UNAVAILABLE_MESSAGE }
  } else if (error instanceof ServiceUnavailableError) message = SERVICE_UNAVAILABLE_MESSAGE
  return Response.json({ error: message }, { status, headers: PRIVATE_RESPONSE_HEADERS })
}
