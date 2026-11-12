import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { copyPrivateDeck, describeCloudError } from '../lib/cloudDecks'
import type { StudyCard, StudyDeck } from '../types/domain'
import type { AppShellContextValue } from './AppShell'
import { onlineDeckPath, paths } from '../router/paths'

export default function LegacyDecksRoute() {
  const { user, loadLibrary } = useOutletContext<AppShellContextValue>()
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Array<{ deck: StudyDeck; cards: StudyCard[] }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setDecks([]); setSelected(null); setLoading(true); setError('')
    void (async () => {
      // Only recovery loads IndexedDB; cloud decks do not depend on device storage.
      const db = await import('../lib/db')
      if (!active) return
      db.setDatabaseUser(user.uid)
      const stored = await db.getAllDecks()
      const result = []
      for (const deck of stored) result.push({ deck, cards: await db.getCardsByDeck(deck.id) })
      if (active) setDecks(result)
    })().catch((cause) => { if (active) setError(describeCloudError(cause, 'Device storage could not be opened.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.uid])
  const preview = decks.find((item) => item.deck.id === selected)
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <Link to={paths.dashboard} className="btn btn-ghost">Back to cloud library</Link>
    <h1 className="mt-5 text-3xl font-black">Legacy decks on this device</h1>
    <p className="mt-3 text-base-content/65">Offline decks are retired. Existing cards and schedules remain untouched in this browser. Preview a deck and explicitly copy it to your private account; cloud review progress starts fresh.</p>
    {loading && <span className="loading loading-spinner mt-6" />}
    {error && <p role="alert" className="mt-5 text-error">{error}</p>}
    {!loading && !decks.length && !error && <p className="mt-6">No legacy decks for this account were found on this device.</p>}
    <div className="mt-6 grid gap-3">{decks.map(({ deck, cards }) => <button key={deck.id} className="rounded-2xl border border-base-300 bg-base-100 p-4 text-left" onClick={() => setSelected(deck.id)}><span className="font-bold">{deck.title}</span><span className="ml-3 text-sm">{cards.length} cards · Preview recovery</span></button>)}</div>
    {preview && <section className="mt-6 rounded-3xl border border-primary/30 bg-base-100 p-6" aria-label="Confirm private cloud copy">
      <h2 className="text-2xl font-bold">{preview.deck.title}</h2><p className="mt-2">{preview.deck.description}</p>
      {preview.deck.studyGuide && <p className="mt-4 whitespace-pre-wrap">{preview.deck.studyGuide}</p>}
      <ol className="mt-4 grid gap-3">{preview.cards.map((card, index) => <li key={`${card.id}-${index}`} className="rounded-xl bg-base-200 p-3"><p className="font-semibold">{index + 1}. {card.question}</p><p>{card.answer}</p>{card.distractors?.length > 0 && <p className="text-sm">{card.distractors.join(' · ')}</p>}</li>)}</ol>
      <p className="mt-5 text-sm">Confirming uploads only this deck’s content to Firebase as a private copy. The device original and its schedule will not be changed or deleted.</p>
      <button disabled={saving} className="btn btn-primary mt-4" onClick={async () => {
        setSaving(true); setError('')
        try {
          const deck = await copyPrivateDeck(user, { ...preview.deck, cards: preview.cards }, `legacy:${preview.deck.id}`)
          await loadLibrary(); navigate(onlineDeckPath(deck.id))
        } catch (cause) { setError(describeCloudError(cause, 'The cloud copy failed. Your device original is intact.')) }
        finally { setSaving(false) }
      }}>{saving ? 'Confirming cloud save…' : 'Confirm private cloud copy'}</button>
      <button disabled={saving} className="btn btn-ghost mt-4" onClick={() => setSelected(null)}>Cancel</button>
    </section>}
  </main>
}
