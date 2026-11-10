import type { GeneratedCard } from '../types/domain'

export const STUDY_GUIDE_COVERAGE = 'literal-answers-v1' as const
export type StudyGuideCoverage = typeof STUDY_GUIDE_COVERAGE

const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u
const DASHES = /[‐‑‒–—―−]/gu
const QUOTES = /[‘’‚‛`´]/gu
const DOUBLE_QUOTES = /[“”„‟]/gu

export function canonicalizeStudyText(value: unknown): string {
  return Array.from(String(value ?? ''))
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code >= 32
    })
    .join('')
    .normalize('NFKC')
    .replace(DASHES, '-')
    .replace(QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(/\s*-\s*/gu, '-')
    .trim()
}

function boundaryValid(text: string, start: number, answer: string): boolean {
  const first = answer[0]
  const last = answer[answer.length - 1]
  const before = start > 0 ? text[start - 1] : ''
  const afterIndex = start + answer.length
  const after = afterIndex < text.length ? text[afterIndex] : ''
  return (!WORD_CHARACTER.test(first) || !before || !WORD_CHARACTER.test(before))
    && (!WORD_CHARACTER.test(last) || !after || !WORD_CHARACTER.test(after))
}

export function studyGuideContainsAnswer(studyGuide: unknown, answer: unknown): boolean {
  const guide = canonicalizeStudyText(studyGuide)
  const normalizedAnswer = canonicalizeStudyText(answer)
  if (!guide || !normalizedAnswer) return false

  let start = guide.indexOf(normalizedAnswer)
  while (start >= 0) {
    if (boundaryValid(guide, start, normalizedAnswer)) return true
    start = guide.indexOf(normalizedAnswer, start + 1)
  }
  return false
}

export function findUncoveredAnswers(
  studyGuide: unknown,
  cards: ReadonlyArray<Pick<GeneratedCard, 'answer'>>,
): string[] {
  const uncovered: string[] = []
  const checked = new Map<string, boolean>()
  for (const card of cards) {
    const canonical = canonicalizeStudyText(card.answer)
    const covered = checked.get(canonical) ?? studyGuideContainsAnswer(studyGuide, card.answer)
    checked.set(canonical, covered)
    if (!covered) uncovered.push(String(card.answer ?? '').trim())
  }
  return uncovered
}

export function hasCompleteStudyGuideCoverage(
  studyGuide: unknown,
  cards: ReadonlyArray<Pick<GeneratedCard, 'answer'>>,
): boolean {
  return cards.length > 0 && findUncoveredAnswers(studyGuide, cards).length === 0
}
