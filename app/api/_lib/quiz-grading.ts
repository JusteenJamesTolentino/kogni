/**
 * Pure quiz grading. Runs server-side only (the answer key never reaches the client
 * before an attempt is committed); kept free of Firebase imports for unit testing.
 */
export const QUIZ_PASS_PERCENT = 70
export const QUIZ_TIME_LIMIT_SECONDS = 30

export interface GradingQuestion {
  id: string
  prompt: string
  choices: string[]
}

export interface GradedQuestion {
  id: string
  prompt: string
  choices: string[]
  chosenIndex: number
  correctIndex: number
  correct: boolean
}

export interface AttemptGrade {
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  breakdown: GradedQuestion[]
}

/** `answers` maps question id → chosen choice index; unanswered/timeout = -1. */
export function gradeAttempt(
  questions: GradingQuestion[],
  correct: Record<string, number>,
  answers: Record<string, number>,
): AttemptGrade {
  const breakdown: GradedQuestion[] = questions.map((question) => {
    const raw = answers[question.id]
    const chosenIndex = typeof raw === 'number' && Number.isInteger(raw) && raw >= -1 && raw < question.choices.length ? raw : -1
    const correctIndex = correct[question.id]
    return {
      id: question.id,
      prompt: question.prompt,
      choices: question.choices,
      chosenIndex,
      correctIndex,
      correct: chosenIndex === correctIndex,
    }
  })
  const correctCount = breakdown.filter((item) => item.correct).length
  const questionCount = questions.length
  const score = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0
  return { correctCount, questionCount, score, passed: score >= QUIZ_PASS_PERCENT, breakdown }
}

/** Normalizes the submitted answers map: keeps known question ids with valid integer indices. */
export function sanitizeSubmittedAnswers(
  submitted: unknown,
  questionIds: string[],
): Record<string, number> {
  const result: Record<string, number> = {}
  if (typeof submitted !== 'object' || submitted === null) return result
  const allowed = new Set(questionIds)
  for (const [questionId, value] of Object.entries(submitted as Record<string, unknown>)) {
    if (!allowed.has(questionId)) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -1 || value > 3) continue
    result[questionId] = value
  }
  return result
}
