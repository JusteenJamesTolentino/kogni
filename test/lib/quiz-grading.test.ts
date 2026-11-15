import { describe, expect, it } from 'vitest'
import { gradeAttempt, sanitizeSubmittedAnswers, QUIZ_PASS_PERCENT } from '../../app/api/_lib/quiz-grading'

const questions = [
  { id: 'q_0', prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'] },
  { id: 'q_1', prompt: 'Pick B', choices: ['A', 'B', 'C'] },
  { id: 'q_2', prompt: 'Pick C', choices: ['A', 'B', 'C', 'D'] },
]
const correct = { q_0: 0, q_1: 1, q_2: 2 }

describe('quiz grading', () => {
  it('scores all-correct attempts at 100 and passes', () => {
    const grade = gradeAttempt(questions, correct, { q_0: 0, q_1: 1, q_2: 2 })
    expect(grade).toMatchObject({ correctCount: 3, questionCount: 3, score: 100, passed: true })
  })

  it('marks timeouts (-1) and wrong picks incorrect without crashing', () => {
    const grade = gradeAttempt(questions, correct, { q_0: -1, q_1: 0, q_2: 2 })
    expect(grade).toMatchObject({ correctCount: 1, score: 33, passed: false })
    expect(grade.breakdown[0]).toMatchObject({ chosenIndex: -1, correct: false })
    expect(grade.breakdown[2]).toMatchObject({ correct: true })
  })

  it('grades every question unanswered when the answer map is empty', () => {
    const grade = gradeAttempt(questions, correct, {})
    expect(grade).toMatchObject({ correctCount: 0, score: 0 })
    expect(grade.breakdown.every((item) => item.chosenIndex === -1)).toBe(true)
  })

  it('treats out-of-range picks as unanswered', () => {
    const grade = gradeAttempt(questions, correct, { q_0: 7, q_1: 99, q_2: -4 })
    expect(grade.breakdown.every((item) => item.chosenIndex === -1)).toBe(true)
    expect(grade.score).toBe(0)
  })

  it(`passes at exactly ${QUIZ_PASS_PERCENT}%`, () => {
    const two = gradeAttempt(questions.slice(0, 2), { q_0: 0, q_1: 1 }, { q_0: 0, q_1: 1 })
    expect(two.score).toBe(100)
    const borderline = gradeAttempt(
      [
        { id: 'q_0', prompt: 'a', choices: ['x', 'y'] },
        { id: 'q_1', prompt: 'b', choices: ['x', 'y'] },
        { id: 'q_2', prompt: 'c', choices: ['x', 'y'] },
        { id: 'q_3', prompt: 'd', choices: ['x', 'y'] },
      ],
      { q_0: 0, q_1: 0, q_2: 0, q_3: 0 },
      { q_0: 0, q_1: 0, q_2: 0, q_3: 1 },
    )
    expect(borderline.score).toBe(75)
    expect(borderline.passed).toBe(true)
  })
})

describe('submitted answer sanitization', () => {
  it('keeps valid entries, drops unknown question ids and malformed values', () => {
    expect(sanitizeSubmittedAnswers({ q_0: 0, q_1: -1, q_9: 1, q_2: 'x', q_3: 1.5 }, ['q_0', 'q_1', 'q_2'])).toEqual({ q_0: 0, q_1: -1 })
    expect(sanitizeSubmittedAnswers(null, ['q_0'])).toEqual({})
    expect(sanitizeSubmittedAnswers('not-an-object', ['q_0'])).toEqual({})
  })
})
