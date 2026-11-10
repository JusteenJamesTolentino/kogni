import { adminAuth, adminDatabase, AdminConfigurationError } from '../../../src/lib/firebase-admin'
import { UID_PATTERN } from '../../../functions/src/social-core'
import { ServiceUnavailableError, withTimeout } from './database'

export { adminDatabase }

export class AuthenticationError extends Error {
  constructor() {
    super('Authentication is required.')
    this.name = 'AuthenticationError'
  }
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get('authorization')
  const match = authorization && /^Bearer ([^\s]+)$/i.exec(authorization)
  if (!match || !match[1]) throw new AuthenticationError()
  const auth = adminAuth()
  try {
    const user = await withTimeout(() => auth.verifyIdToken(match[1]!))
    if (!UID_PATTERN.test(user.uid)) throw new AuthenticationError()
    return user
  } catch (error) {
    if (error instanceof AdminConfigurationError || error instanceof ServiceUnavailableError) throw error
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
    const invalidTokenCodes = new Set([
      'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
      'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
    ])
    if (error instanceof AuthenticationError || (typeof code === 'string' && invalidTokenCodes.has(code))) {
      throw new AuthenticationError()
    }
    throw new ServiceUnavailableError()
  }
}
