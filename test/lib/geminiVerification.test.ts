import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, generateContentMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  generateContentMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { get: getMock, generateContent: generateContentMock }
  },
}))

import { normalizeGeminiApiKey, verifyGeminiSettings } from '../../src/lib/geminiVerification'

beforeEach(() => {
  getMock.mockReset()
  generateContentMock.mockReset()
})

describe('Gemini settings verification', () => {
  it('accepts non-AIza key formats and checks model metadata only', async () => {
    getMock.mockResolvedValue({ supportedActions: ['generateContent'] })
    await expect(verifyGeminiSettings(' custom-key-format ', ' gemini-custom ')).resolves.toEqual({ model: 'gemini-custom' })
    expect(getMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-custom' }))
    expect(generateContentMock).not.toHaveBeenCalled()
  })

  it('rejects models without generateContent support', async () => {
    getMock.mockResolvedValue({ supportedActions: ['embedContent'] })
    await expect(verifyGeminiSettings('secret-value', 'embedding-model')).rejects.toThrow('model ID or verification request is invalid')
  })

  it.each([
    [400, 'model ID or verification request is invalid'],
    [401, 'Google rejected the key'],
    [403, 'Google rejected the key'],
    [404, 'model is not available'],
    [429, 'quota'],
    [503, 'temporarily unavailable'],
  ])('maps HTTP %i without exposing the key', async (status, message) => {
    getMock.mockRejectedValue(Object.assign(new Error('provider body secret-value'), { status }))
    const promise = verifyGeminiSettings('secret-value', 'model-name')
    await expect(promise).rejects.toThrow(message)
    await expect(promise).rejects.not.toThrow('secret-value')
  })

  it('validates key locally without requiring a fixed prefix', () => {
    expect(normalizeGeminiApiKey('abc-123')).toBe('abc-123')
    expect(() => normalizeGeminiApiKey('bad key')).toThrow('exactly as provided')
  })
})
