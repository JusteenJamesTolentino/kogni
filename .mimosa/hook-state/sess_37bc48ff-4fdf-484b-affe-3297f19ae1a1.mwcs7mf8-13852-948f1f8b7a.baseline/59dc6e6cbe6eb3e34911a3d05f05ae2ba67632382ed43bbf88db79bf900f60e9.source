import { describe, expect, it } from 'vitest'
import { normalizeGeminiModel } from '../../src/lib/geminiSettings'

describe('normalizeGeminiModel', () => {
  it('trims and accepts arbitrary model identifiers', () => {
    expect(normalizeGeminiModel('  publisher/models/custom.v2  ')).toBe('publisher/models/custom.v2')
    expect(normalizeGeminiModel('gemma-4-31b-it')).toBe('gemma-4-31b-it')
  })

  it('rejects an empty model identifier', () => {
    expect(() => normalizeGeminiModel('   ')).toThrow('Gemini model ID is required')
  })

  it('rejects whitespace inside a model identifier', () => {
    expect(() => normalizeGeminiModel('gemini 3 flash')).toThrow('Gemini model ID cannot contain whitespace')
  })

  it('rejects control characters', () => {
    expect(() => normalizeGeminiModel('gemini-3\u0000-flash')).toThrow('Gemini model ID cannot contain control characters')
  })
})
