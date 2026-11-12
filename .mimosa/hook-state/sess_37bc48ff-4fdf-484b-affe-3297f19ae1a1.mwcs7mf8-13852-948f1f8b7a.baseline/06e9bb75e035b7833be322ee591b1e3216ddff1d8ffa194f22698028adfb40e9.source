import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ContinuationCreator from '../components/ContinuationCreator'
import StudySession from '../components/StudySession'
import { useAuth } from '../context/AuthContext'
import { createDeckSeries, recordOnlinePartRating } from '../lib/deckSeries'
import { generateDeckContinuation } from '../lib/gemini'
import { getOnlineDeckHead, getOnlineDeckVersion } from '../lib/onlineDecks'
import { get, ref } from 'firebase/database'
import { database } from '../lib/firebase'
import type { DeckSeries, GeneratedDeck, OnlineDeckHead, OnlineDeckVersion, StudyCard, StudyDeck } from '../types/domain'
import { onlineDeckPath } from '../router/paths'

async function loadSeries(seriesId: string): Promise<DeckSeries | null> {
  const value = (await get(ref(database, `deckSeries/${seriesId}`))).val() as unknown
  return value && typeof value === 'object' ? value as DeckSeries : null
}

export function OnlineDeckStudyRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [head, setHead] = useState<OnlineDeckHead | null>(null)
  const [version, setVersion] = useState<OnlineDeckVersion | null>(null)
  const [series, setSeries] = useState<DeckSeries | null>(null)
  const [ratedCount, setRatedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const loadedHead = await getOnlineDeckHead(deckId)
      if (!loadedHead) throw new Error('Online deck unavailable')
      const loadedVersion = await getOnlineDeckVersion(deckId, loadedHead.latestVersion)
      if (!loadedVersion) throw new Error('Published version unavailable')
      const loadedSeries = loadedHead.seriesId ? await loadSeries(loadedHead.seriesId) : null
      let existingRatedCount = 0
      if (user && loadedHead.seriesId && loadedHead.partNumber) {
        const progressValue = (await get(ref(database, `onlinePartProgress/${user.uid}/${loadedHead.seriesId}/${loadedHead.partNumber}`))).val() as unknown
        if (progressValue && typeof progressValue === 'object' && 'ratedCount' in progressValue && typeof progressValue.ratedCount === 'number') {
          existingRatedCount = progressValue.ratedCount
        }
      }
      if (active) { setHead(loadedHead); setVersion(loadedVersion); setSeries(loadedSeries); setRatedCount(existingRatedCount) }
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Online study unavailable') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId, user])

  if (loading) return <main className="grid min-h-[70vh] place-items-center"><span className="loading loading-spinner loading-lg" /></main>
  if (!head || !version || error) return <main className="grid min-h-[70vh] place-items-center"><p role="alert">{error || 'Online study unavailable'}</p></main>

  const ordered = Object.values(version.cards).sort((a, b) => a.order - b.order)
  const cards: StudyCard[] = ordered.map((card) => ({ ...card, distractors: card.distractors ?? [], deckId, ownerId: user?.uid || '', interval: 0, repetition: 0, easinessFactor: 2.5, nextReviewDate: version.publishedAt }))
  const deck: StudyDeck = { id: deckId, ownerId: head.ownerId, title: version.title, description: version.description, studyGuide: version.studyGuide, cardCount: cards.length, createdAt: version.publishedAt }
  const nextPart = series && head.partNumber ? series.parts[String(head.partNumber + 1)] : undefined

  return <StudySession
    cards={cards}
    deck={deck}
    mode="practice"
    onlinePartCompletion={head.seriesId && head.partNumber ? {
      ratedDistinctCount: ratedCount,
      partNumber: head.partNumber,
      nextPartNumber: head.partNumber + 1,
      nextPartAvailable: Boolean(nextPart),
      unavailableMessage: 'The creator has not published the next part yet.',
      onContinueToNextPart: nextPart ? () => navigate(onlineDeckPath(nextPart.deckId)) : undefined,
    } : undefined}
    onExit={() => navigate(onlineDeckPath(deckId))}
    onFinished={() => navigate(onlineDeckPath(deckId))}
    onGenerateAnother={() => navigate(onlineDeckPath(deckId))}
    onCardRated={async (cardId) => {
      if (user && head.seriesId && head.partNumber) {
        const result = await recordOnlinePartRating(user, { seriesId: head.seriesId, partNumber: head.partNumber, deckId, cardId })
        setRatedCount(result.progress.ratedCount)
      }
    }}
  />
}

export function OnlineDeckContinuationRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [head, setHead] = useState<OnlineDeckHead | null>(null)
  const [version, setVersion] = useState<OnlineDeckVersion | null>(null)
  const [series, setSeries] = useState<DeckSeries | null>(null)
  const [draft, setDraft] = useState<GeneratedDeck | null>(null)
  const [status, setStatus] = useState<'ready' | 'generating' | 'review' | 'publishing' | 'published'>('ready')
  const [error, setError] = useState('')
  const apiKey = localStorage.getItem('user_gemini_api_key') || ''
  const model = localStorage.getItem('user_gemini_model') || ''

  useEffect(() => {
    let active = true
    void (async () => {
      const loadedHead = await getOnlineDeckHead(deckId)
      if (!loadedHead || loadedHead.ownerId !== user?.uid) throw new Error('Only the creator can continue this deck')
      const loadedVersion = await getOnlineDeckVersion(deckId, loadedHead.latestVersion)
      if (!loadedVersion) throw new Error('Published version unavailable')
      let loadedSeries = loadedHead.seriesId ? await loadSeries(loadedHead.seriesId) : null
      if (!loadedSeries) loadedSeries = await createDeckSeries(user, { seriesId: deckId, topic: loadedVersion.title, rootDeckId: deckId, cardCount: 30 })
      if (active) { setHead(loadedHead); setVersion(loadedVersion); setSeries(loadedSeries) }
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Continuation unavailable') })
    return () => { active = false }
  }, [deckId, user])

  if (!head || !version || !series) return <main className="grid min-h-[70vh] place-items-center"><p>{error || 'Loading continuation…'}</p></main>
  const priorQuestions = Object.values(version.cards).sort((a, b) => a.order - b.order).map((card) => card.question)

  return <ContinuationCreator
    seriesTitle={series.topic}
    currentPartNumber={series.latestPartNumber}
    context={{ topic: series.topic, guideIncluded: Boolean(version.studyGuide), priorQuestionCount: priorQuestions.length }}
    hasCreatorKey={Boolean(apiKey && model)}
    status={status}
    error={error}
    draft={draft ? { title: draft.title, description: draft.description, questionCount: draft.cards.length, guideIncluded: Boolean(draft.studyGuide) } : null}
    onGenerateNext={async () => {
      if (!user) return
      setStatus('generating'); setError('')
      try {
        setDraft(await generateDeckContinuation(user, { topic: series.topic, studyGuide: version.studyGuide || version.description, priorQuestions }, apiKey, model))
        setStatus('review')
      } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Continuation generation failed'); setStatus('ready') }
    }}
    onPublishDraft={async () => {
      if (!draft) return
      setStatus('publishing')
      setError('Publishing integration requires creator review and a new local draft deck ID before series linkage.')
      setStatus('review')
    }}
    onCancel={() => navigate(onlineDeckPath(deckId))}
  />
}
