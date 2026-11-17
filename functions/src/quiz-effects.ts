import type { CoreDatabase } from './database-core.js'
import {
  QUIZ_INTEGRITY_RETENTION_MS,
  advanceExpiredAttempt,
  applyCompletedAttemptStats,
  parseCompletedQuizAttempt,
  parseQuizAnswerKey,
  parseQuizAttemptV2,
  parseQuizRecord,
} from './quiz-core.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface QuizIntegrityCleanupSummary {
  attemptsCompleted: number
  eventLogsDeleted: number
  invalidRecordsSkipped: number
}

/** Advances abandoned attempts and removes expired raw signal logs. */
export async function cleanupQuizIntegrityData(
  database: CoreDatabase,
  now = Date.now(),
): Promise<QuizIntegrityCleanupSummary> {
  const attemptsValue = (await database.ref('quizAttempts').get()).val()
  const eventsValue = (await database.ref('quizAttemptEvents').get()).val()
  const quizzesValue = (await database.ref('quizzes').get()).val()
  const keysValue = (await database.ref('quizAnswers').get()).val()
  const attempts = isRecord(attemptsValue) ? attemptsValue : {}
  const eventLogs = isRecord(eventsValue) ? eventsValue : {}
  const quizzes = isRecord(quizzesValue) ? quizzesValue : {}
  const keys = isRecord(keysValue) ? keysValue : {}
  let attemptsCompleted = 0
  let eventLogsDeleted = 0
  let invalidRecordsSkipped = 0

  for (const [quizId, usersValue] of Object.entries(attempts)) {
    if (!isRecord(usersValue)) { invalidRecordsSkipped += 1; continue }
    const quiz = parseQuizRecord(quizzes[quizId], quizId)
    const answerKey = quiz ? parseQuizAnswerKey(keys[quizId], quiz) : null
    if (!quiz || !answerKey) { invalidRecordsSkipped += Object.keys(usersValue).length; continue }

    for (const [uid, attemptValue] of Object.entries(usersValue)) {
      const attempt = parseQuizAttemptV2(attemptValue, quiz, answerKey)
      if (!attempt || attempt.uid !== uid) { invalidRecordsSkipped += 1; continue }
      if (attempt.status === 'active') {
        const advanced = advanceExpiredAttempt(attempt, quiz, answerKey, now)
        if (advanced.status === 'completed') {
          const reference = database.ref(`quizAttempts/${quizId}/${uid}`)
          const committed = await reference.transaction((current) => {
            const latest = parseQuizAttemptV2(current, quiz, answerKey)
            if (!latest || latest.status !== 'active' || latest.attemptId !== attempt.attemptId || latest.sessionId !== attempt.sessionId) return undefined
            const latestAdvanced = advanceExpiredAttempt(latest, quiz, answerKey, now)
            return latestAdvanced.status === 'completed' ? latestAdvanced : undefined
          })
          if (committed.committed) attemptsCompleted += 1
        }
        continue
      }
    }
  }

  for (const [quizId, usersValue] of Object.entries(eventLogs)) {
    if (!isRecord(usersValue)) continue
    for (const [uid, recordsValue] of Object.entries(usersValue)) {
      if (!isRecord(recordsValue)) continue
      const attemptValue = isRecord(attempts[quizId]) ? attempts[quizId][uid] : undefined
      const quiz = parseQuizRecord(quizzes[quizId], quizId)
      const answerKey = quiz ? parseQuizAnswerKey(keys[quizId], quiz) : null
      const attempt = quiz && answerKey ? parseQuizAttemptV2(attemptValue, quiz, answerKey) : null
      const receivedTimes = Object.values(recordsValue)
        .filter(isRecord)
        .map((record) => record.receivedAt)
        .filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      const latestReceivedAt = receivedTimes.length > 0 ? Math.max(...receivedTimes) : null
      const deleteAfter = attempt?.status === 'completed' && attempt.integrity?.deleteAfter !== undefined
        ? attempt.integrity.deleteAfter
        : latestReceivedAt === null ? null : latestReceivedAt + QUIZ_INTEGRITY_RETENTION_MS
      if (deleteAfter !== null && deleteAfter <= now) {
        await database.ref(`quizAttemptEvents/${quizId}/${uid}`).remove()
        eventLogsDeleted += 1
      }
    }
  }
  return { attemptsCompleted, eventLogsDeleted, invalidRecordsSkipped }
}

/** Repairs quiz rank projections after a route timeout or process termination. */
export async function reconcileQuizAttemptEffects(
  database: CoreDatabase,
  quizId: string,
  uid: string,
): Promise<boolean> {
  const [quizValue, keyValue, attemptValue] = await Promise.all([
    database.ref(`quizzes/${quizId}`).get().then((snapshot) => snapshot.val()),
    database.ref(`quizAnswers/${quizId}`).get().then((snapshot) => snapshot.val()),
    database.ref(`quizAttempts/${quizId}/${uid}`).get().then((snapshot) => snapshot.val()),
  ])
  const quiz = parseQuizRecord(quizValue, quizId)
  const answerKey = quiz ? parseQuizAnswerKey(keyValue, quiz) : null
  const attempt = quiz && answerKey ? parseCompletedQuizAttempt(attemptValue, quiz, answerKey) : null
  if (!quiz || !answerKey || !attempt || attempt.uid !== uid) return false

  await database.ref(`roleStats/${uid}`).transaction((current) => applyCompletedAttemptStats(current, attempt))
  const writes: Record<string, unknown> = {}
  if (attempt.score === 100) writes[`badges/${uid}/perfect-round`] = { awardedAt: attempt.gradedAt, type: 'auto' }
  const owned = (await database.ref(`quizzesByOwner/${quiz.ownerId}`).get()).val()
  if (isRecord(owned) && Object.keys(owned).length >= 10) {
    writes[`badges/${quiz.ownerId}/quiz-architect`] = { awardedAt: attempt.gradedAt, type: 'auto' }
  }
  if (Object.keys(writes).length > 0) await database.ref().update(writes)
  return true
}
