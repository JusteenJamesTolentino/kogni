import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DeckEditor from '../components/DeckEditor'
import type { DeckEditorDraft, DeckEditorSaveContext } from '../components/DeckEditor'
import DeleteDeckDialog from '../components/DeleteDeckDialog'
import RegenerateDeck from '../components/RegenerateDeck'
import { useAuth } from '../context/AuthContext'
import {
  addLocalCard,
  deleteLocalCard,
  deleteLocalDeck,
  forkLocalDeck,
  getCardsByDeck,
  getDeck,
  getOfflineSnapshotRecord,
  reorderLocalCards,
  saveDeckWithCards,
  updateLocalCardContent,
  updateLocalDeckMetadata,
} from '../lib/db'
import { generateDeckFromFile } from '../lib/gemini'
import { getDeckPortalCode, revokeDeckPortal } from '../lib/portal'
import type { GeneratedDeck, StudyCard, StudyDeck } from '../types/domain'
import { deckEditPath, deckPath, paths } from '../router/paths'

function toDraft(deck: StudyDeck, cards: StudyCard[]): DeckEditorDraft {
  return {
    title: deck.title,
    description: deck.description,
    studyGuide: deck.studyGuide || '',
    cards: cards.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)).map((card) => ({ id: card.id, question: card.question, answer: card.answer, distractors: [...card.distractors] })),
  }
}

export function LocalDeckEditRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [deck, setDeck] = useState<StudyDeck | null>(null)
  const [cards, setCards] = useState<StudyCard[]>([])
  const [snapshot, setSnapshot] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([getDeck(deckId), getCardsByDeck(deckId), getOfflineSnapshotRecord(deckId)])
      .then(([loadedDeck, loadedCards, provenance]) => {
        if (!loadedDeck) throw new Error('Deck not found')
        if (active) { setDeck(loadedDeck); setCards(loadedCards); setSnapshot(Boolean(provenance)) }
      })
      .catch(() => { if (active) setError('This deck could not be loaded for editing.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId])

  if (loading) return <main className="grid min-h-[65vh] place-items-center"><span className="loading loading-spinner loading-lg" /></main>
  if (!deck) return <main className="grid min-h-[65vh] place-items-center"><p>{error}</p></main>

  const save = async (draft: DeckEditorDraft, context: DeckEditorSaveContext): Promise<void> => {
    setSaving(true); setError('')
    try {
      let targetDeck = deck
      if (snapshot && context.scheduleResetCardIds.length > 0) {
        const forked = await forkLocalDeck(deck.id)
        targetDeck = forked
        navigate(deckEditPath(forked.id), { replace: true })
      }
      await updateLocalDeckMetadata(targetDeck.id, { title: draft.title, description: draft.description, studyGuide: draft.studyGuide })
      const existingIds = new Set(cards.map((card) => card.id))
      const draftIds = new Set(draft.cards.map((card) => card.id))
      for (const cardId of existingIds) if (!draftIds.has(cardId)) await deleteLocalCard(cardId)
      const orderIds: string[] = []
      for (const card of draft.cards) {
        if (existingIds.has(card.id)) {
          await updateLocalCardContent(card.id, card)
          orderIds.push(card.id)
        } else {
          const created = await addLocalCard(targetDeck.id, card)
          orderIds.push(created.id)
        }
      }
      await reorderLocalCards(targetDeck.id, orderIds)
      navigate(deckPath(targetDeck.id))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Deck changes could not be saved.')
      setSaving(false)
    }
  }

  return <>
    <DeckEditor initialDraft={toDraft(deck, cards)} saving={saving} saveError={error} onSave={save} onCancel={() => navigate(deckPath(deck.id))} />
    <div className="mx-auto -mt-16 mb-24 max-w-6xl px-4 sm:px-6 lg:px-8"><button className="btn btn-error btn-outline" onClick={() => setDeleteOpen(true)}>Delete deck</button></div>
    <DeleteDeckDialog open={deleteOpen} deckTitle={deck.title} cardCount={cards.length} isOfflineSnapshot={snapshot} hasActivePortal onClose={() => setDeleteOpen(false)} onDelete={async () => {
      if (user) {
        const portal = await getDeckPortalCode(user, deck.id)
        if (portal) await revokeDeckPortal(user, portal)
      }
      await deleteLocalDeck(deck.id)
      navigate(paths.dashboard)
      return { portalRevokeStatus: 'revoked' }
    }} />
  </>
}

export function LocalDeckRegenerateRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<StudyDeck | null>(null)
  const [draft, setDraft] = useState<GeneratedDeck | null>(null)
  const apiKey = localStorage.getItem('user_gemini_api_key') || ''
  const model = localStorage.getItem('user_gemini_model') || ''

  useEffect(() => { void getDeck(deckId).then((value) => setDeck(value || null)) }, [deckId])
  if (!deck) return <main className="grid min-h-[65vh] place-items-center"><p>Loading source deck…</p></main>

  return <RegenerateDeck sourceDeckTitle={deck.title} generatedDraft={draft} onDraftChange={setDraft} onCancel={() => navigate(deckPath(deck.id))} onGenerate={async (file, report) => {
    const generated = await generateDeckFromFile(file, apiKey, model, (progress) => report({ stage: progress.stage, message: progress.message, detail: progress.model }))
    setDraft(generated)
    return generated
  }} onSaveAsNewDeck={async (generated) => {
    const saved = await saveDeckWithCards({ title: generated.title, description: generated.description, studyGuide: generated.studyGuide }, generated.cards)
    navigate(deckPath(saved.id))
  }} />
}
