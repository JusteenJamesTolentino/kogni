import 'server-only'
import { createPrivateKey } from 'node:crypto'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

export const ADMIN_CONFIG_MESSAGE = 'Firebase Admin service is not configured correctly.'
const APP_NAME = 'kognit-next-admin'

export class AdminConfigurationError extends Error {
  constructor() {
    super(ADMIN_CONFIG_MESSAGE)
    this.name = 'AdminConfigurationError'
  }
}

export function validateAdminEnvironment(environment: Record<string, string | undefined>) {
  const projectId = environment.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = environment.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  const databaseURL = environment.FIREBASE_DATABASE_URL?.trim()
  try {
    if (!projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) ||
        !clientEmail || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail) ||
        !privateKey || !databaseURL || environment.FIREBASE_DATABASE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new AdminConfigurationError()
    }
    if (!/^https:\/\/[a-z0-9.-]+\/?$/.test(databaseURL)) throw new AdminConfigurationError()
    const url = new URL(databaseURL)
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/' || url.search || url.hash ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:firebaseio\.com|firebasedatabase\.app)$/.test(url.hostname)) {
      throw new AdminConfigurationError()
    }
    if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----$/.test(privateKey) ||
        createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') {
      throw new AdminConfigurationError()
    }
    return { projectId, clientEmail, privateKey, databaseURL: url.href }
  } catch {
    // SDK/parser errors can contain credential values; never retain their message/cause.
    throw new AdminConfigurationError()
  }
}

export function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME)
  if (existing) return existing
  const { databaseURL, ...serviceAccount } = validateAdminEnvironment(process.env)
  try {
    return initializeApp({ credential: cert(serviceAccount), databaseURL }, APP_NAME)
  } catch {
    throw new AdminConfigurationError()
  }
}

export function adminAuth() {
  try { return getAuth(getAdminApp()) } catch { throw new AdminConfigurationError() }
}

export function adminDatabase() {
  try { return getDatabase(getAdminApp()) } catch { throw new AdminConfigurationError() }
}
