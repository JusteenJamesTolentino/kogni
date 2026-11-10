export const GEMINI_API_KEY_STORAGE = 'user_gemini_api_key'
export const GEMINI_MODEL_STORAGE = 'user_gemini_model'

const MAX_MODEL_ID_LENGTH = 200

export interface GeminiSettings {
  apiKey: string
  model: string
}

export function normalizeGeminiModel(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Gemini model ID is required')

  const model = value.trim()
  if (!model) throw new TypeError('Gemini model ID is required')
  if (model.length > MAX_MODEL_ID_LENGTH) {
    throw new RangeError(`Gemini model ID must be ${MAX_MODEL_ID_LENGTH} characters or fewer`)
  }
  if (/\s/u.test(model)) throw new TypeError('Gemini model ID cannot contain whitespace')
  if (Array.from(model).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new TypeError('Gemini model ID cannot contain control characters')
  }

  return model
}
