import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import { gradeAttempt, sanitizeSubmittedAnswers } from '../../_lib/quiz-grading'
import type { GradingQuestion } from '../../_lib/quiz-grading'

export const runtime = 'nodejs'

/**
 * Grades a quiz attempt server-side. The client never receives the answer key before
 * its attempt is committed: this endpoint reads quizAnswers via Admin, enforces the
 * one-attempt contract, records the roster entry, updates rank aggregates, and grants
 * auto badges. Quizzes award no XP and touch no schedules by construction.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null) throw new InputError()
    const { quizId } = body as { quizId?: unknown }
    if (typeof quizId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(quizId)) throw new InputError()

    const database = databaseWithDeadline(adminDatabase())

    const quizSnapshot = await database.ref(`quizzes/${quizId}`).get()
    const quiz = quizSnapshot.val() as
      | { ownerId?: unknown; title?: unknown; questions?: Record<string, { prompt?: unknown; choices?: unknown }> }
      | null
    if (quiz === null || typeof quiz !== 'object' || typeof quiz.ownerId !== 'string' || typeof quiz.questions !== 'object' || quiz.questions === null) {
      throw new InputError()
    }
    if (quiz.ownerId === user.uid) {
      return jsonResult({ status: 'rejected', reason: 'own-quiz' })
    }

    const answerKey = (await database.ref(`quizAnswers/${quizId}`).get()).val() as { correct?: Record<string, number> } | null
    if (answerKey === null || typeof answerKey.correct !== 'object' || answerKey.correct === null) throw new InputError()

    const questions: GradingQuestion[] = Object.entries(quiz.questions)
      .filter(([, value]) => typeof value === 'object' && value !== null && Array.isArray((value as { choices?: unknown }).choices))
      .map(([id, value]) => ({
        id,
        prompt: String((value as { prompt?: unknown }).prompt ?? ''),
        choices: (value as { choices: unknown[] }).choices.map((choice) => String(choice)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
    if (questions.length === 0) throw new InputError()

    const attemptPath = `quizAttempts/${quizId}/${user.uid}`
    const existing = (await database.ref(attemptPath).get()).val() as { score?: unknown } | null
    if (existing !== null && typeof existing === 'object' && typeof existing.score === 'number') {
      // One graded attempt per quiz, ever — resubmitting returns the stored result.
      return jsonResult({ status: 'already', result: existing })
    }

    const answers = sanitizeSubmittedAnswers((body as { answers?: unknown }).answers, questions.map((question) => question.id))
    const grade = gradeAttempt(questions, answerKey.correct, answers)

    const account = (await database.ref(`accounts/${user.uid}`).get()).val() as { nickname?: unknown } | null
    const nickname = typeof account?.nickname === 'string' && account.nickname ? account.nickname : 'Kogni learner'
    const gradedAt = Date.now()

    const attemptRecord = {
      uid: user.uid,
      nickname,
      quizId,
      quizTitle: typeof quiz.title === 'string' ? quiz.title : '',
      answers,
      correctCount: grade.correctCount,
      questionCount: grade.questionCount,
      score: grade.score,
      passed: grade.passed,
      gradedAt,
      breakdown: grade.breakdown,
    }
    await database.ref(`quizAttempts/${quizId}`).update({ [user.uid]: attemptRecord })

    // Rank aggregates move only here — no XP, no schedules, no leaderboards.
    const statsResult = await database.ref(`roleStats/${user.uid}`).transaction((current: unknown) => {
      const record = (typeof current === 'object' && current !== null ? current : {}) as {
        quizzesTaken?: number; quizzesPassed?: number; currentStreak?: number; bestStreak?: number; totalCorrect?: number; totalQuestions?: number
      }
      const taken = Number.isSafeInteger(record.quizzesTaken) ? record.quizzesTaken! : 0
      const passed = Number.isSafeInteger(record.quizzesPassed) ? record.quizzesPassed! : 0
      const currentStreak = Number.isSafeInteger(record.currentStreak) ? record.currentStreak! : 0
      const bestStreak = Number.isSafeInteger(record.bestStreak) ? record.bestStreak! : 0
      const totalCorrect = Number.isSafeInteger(record.totalCorrect) ? record.totalCorrect! : 0
      const totalQuestions = Number.isSafeInteger(record.totalQuestions) ? record.totalQuestions! : 0
      const nextStreak = grade.passed ? currentStreak + 1 : 0
      return {
        quizzesTaken: taken + 1,
        quizzesPassed: passed + (grade.passed ? 1 : 0),
        currentStreak: nextStreak,
        bestStreak: Math.max(bestStreak, nextStreak),
        totalCorrect: totalCorrect + grade.correctCount,
        totalQuestions: totalQuestions + grade.questionCount,
        lastQuizAt: gradedAt,
      }
    })
    const stats = statsResult.snapshot.val() as {
      quizzesTaken?: number; quizzesPassed?: number; currentStreak?: number; bestStreak?: number; totalCorrect?: number; totalQuestions?: number
    } | null
    const lifetimeAccuracy = stats && typeof stats.totalCorrect === 'number' && typeof stats.totalQuestions === 'number' && stats.totalQuestions > 0
      ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
      : 0

    // Auto badges: Perfect Round on a 100% attempt; Quiz Architect for owners of 10+ quizzes.
    const badgeWrites: Record<string, unknown> = {}
    if (grade.score === 100) badgeWrites[`badges/${user.uid}/perfect-round`] = { awardedAt: gradedAt, type: 'auto' }
    const ownedQuizzes = (await database.ref(`quizzesByOwner/${quiz.ownerId}`).get()).val()
    if (typeof ownedQuizzes === 'object' && ownedQuizzes !== null && Object.keys(ownedQuizzes).length >= 10) {
      badgeWrites[`badges/${quiz.ownerId}/quiz-architect`] = { awardedAt: gradedAt, type: 'auto' }
    }
    if (Object.keys(badgeWrites).length > 0) await database.ref('/').update(badgeWrites)

    return jsonResult({
      status: 'graded',
      result: attemptRecord,
      stats: { ...stats, lifetimeAccuracy },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
