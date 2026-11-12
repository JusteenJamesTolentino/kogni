import { describe, expect, it } from 'vitest'
import {
  canonicalizeStudyText,
  findUncoveredAnswers,
  hasCompleteStudyGuideCoverage,
  studyGuideContainsAnswer,
} from '../../src/lib/studyGuideCoverage'

describe('study guide answer coverage', () => {
  it('normalizes Unicode, case, whitespace, quotes, and hyphens', () => {
    expect(canonicalizeStudyText('  T–cell\r\n “ATP”  ')).toBe('t-cell "atp"')
    expect(studyGuideContainsAnswer('A T‑cell uses ATP.', 't-cell')).toBe(true)
    expect(studyGuideContainsAnswer('Cells use Adenosine   Triphosphate.', 'adenosine triphosphate')).toBe(true)
  })

  it('requires boundary-aware contiguous answers', () => {
    expect(studyGuideContainsAnswer('A question contains text.', 'ion')).toBe(false)
    expect(studyGuideContainsAnswer('The measured value is 120.', '12')).toBe(false)
    expect(studyGuideContainsAnswer('Triphosphate adenosine is reordered.', 'adenosine triphosphate')).toBe(false)
    expect(studyGuideContainsAnswer('Cells use an energy-carrying molecule.', 'adenosine triphosphate')).toBe(false)
  })

  it('preserves symbol-rich answers', () => {
    expect(studyGuideContainsAnswer('Sodium is written Na+ in this reaction.', 'Na+')).toBe(true)
    expect(studyGuideContainsAnswer('The implementation uses C++.', 'C++')).toBe(true)
    expect(studyGuideContainsAnswer('Water is H₂O.', 'H₂O')).toBe(true)
    expect(studyGuideContainsAnswer('The threshold is p < 0.05.', 'p < 0.05')).toBe(true)
  })

  it('reports each uncovered card while caching repeated answers', () => {
    const cards = [{ answer: 'ATP' }, { answer: 'ATP' }, { answer: 'NADH' }]
    expect(findUncoveredAnswers('ATP transfers energy.', cards)).toEqual(['NADH'])
    expect(hasCompleteStudyGuideCoverage('ATP transfers energy and NADH carries electrons.', cards)).toBe(true)
  })
})
