import { GoogleGenAI } from '@google/genai'
import { normalizeGeminiModel } from './geminiSettings'

export interface VerifiedGeminiSettings {
  model: string
}

interface ApiStatusError extends Error {
  status?: number
}

function safeVerificationMessage(error: unknown): string {
  const status = error instanceof Error && 'status' in error
    ? Number((error as ApiStatusError).status)
    : 0
  if (status === 400) return 'The model ID or verification request is invalid.'
  if (status === 401 || status === 403) return 'Google rejected the key, the API is disabled, or the key restrictions do not allow this site.'
  if (status === 404) return 'This model is not available to the Google project connected to this key.'
  if (status === 429) return 'The Google project is rate-limited or has exhausted its current quota.'
  if (status >= 500) return 'Google is temporarily unavailable. Verification is inconclusive; try again later.'
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Verification timed out. The key was not marked invalid; check your connection and try again.'
  }
  return 'Verification could not be completed. Check your connection and try again.'
}

export function normalizeGeminiApiKey(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('A Google AI Studio API key is required')
  const key = value.trim()
  if (!key || /\s/u.test(key) || Array.from(key).some((character) => character.charCodeAt(0) < 33 || character.charCodeAt(0) === 127)) {
    throw new TypeError('Enter the API key exactly as provided by Google AI Studio')
  }
  if (key.length > 500) throw new RangeError('The API key is too long')
  return key
}

export async function verifyGeminiSettings(
  apiKeyValue: unknown,
  modelValue: unknown,
  timeoutMs = 10_000,
): Promise<VerifiedGeminiSettings> {
  const apiKey = normalizeGeminiApiKey(apiKeyValue)
  const model = normalizeGeminiModel(modelValue)
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const ai = new GoogleGenAI({ apiKey })
    const info = await ai.models.get({ model, config: { abortSignal: controller.signal } })
    const supported = Array.isArray(info.supportedActions) && info.supportedActions.includes('generateContent')
    if (!supported) throw Object.assign(new Error('Unsupported model action'), { status: 400 })
    return { model }
  } catch (error: unknown) {
    throw new Error(safeVerificationMessage(error))
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
