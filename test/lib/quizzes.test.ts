import { describe, expect, it } from 'vitest'
import { formatQuizCodeInput, normalizeQuizCode } from '../../src/lib/quizzes'

describe('quiz code normalization', () => {
  it('normalizes shared URLs, lowercase, and stray separators into XXXX-XXXX', () => {
    expect(normalizeQuizCode('abcd-efgh')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode(' ab cd ef gh ')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode('ABCDEFGH')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode('a1b2-c3d4')).toBe('A1B2-C3D4')
  })

  it('rejects anything that is not exactly 8 alphanumeric characters', () => {
    expect(normalizeQuizCode('')).toBeNull()
    expect(normalizeQuizCode('abc')).toBeNull()
    expect(normalizeQuizCode('abcdefghi')).toBeNull()
    expect(normalizeQuizCode('abcd-ef!h')).toBeNull()
    expect(normalizeQuizCode(42)).toBeNull()
    expect(normalizeQuizCode(null)).toBeNull()
  })

  it('formats typing into XXXX-XXXX progressively without blocking input', () => {
    expect(formatQuizCodeInput('a')).toBe('A')
    expect(formatQuizCodeInput('abcd')).toBe('ABCD')
    expect(formatQuizCodeInput('abcde')).toBe('ABCD-E')
    expect(formatQuizCodeInput('abcd-efgh-ijk')).toBe('ABCD-EFGH')
  })
})
