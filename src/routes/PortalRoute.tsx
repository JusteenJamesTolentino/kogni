import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import PortalPreview from '../components/PortalPreview'
import { saveDeckCopy } from '../lib/db'
import { lookupDeckPortal, normalizePortalCode, PORTAL_INVALID_MESSAGE } from '../lib/portal'
import type { DeckPortalRecord } from '../types/domain'
import { deckPath, paths } from '../router/paths'
import type { AppShellContextValue } from './AppShell'

export default function PortalRoute() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { user, loadLibrary } = useOutletContext<AppShellContextValue>()
  const [portal, setPortal] = useState<DeckPortalRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setPortal(null)

    void lookupDeckPortal(user, normalizePortalCode(code))
      .then((result) => {
        if (!active) return
        if (result.ok) setPortal(result.portal)
        else setError(result.message)
      })
      .catch(() => {
        if (active) setError(PORTAL_INVALID_MESSAGE)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [code, user])

  const addToLibrary = async (): Promise<void> => {
    if (!portal || adding) return
    setAdding(true)
    setError('')
    try {
      const saved = await saveDeckCopy(
        portal.snapshot,
        Object.values(portal.snapshot.cards),
        { lineageId: portal.snapshot.lineageId },
      )
      await loadLibrary()
      navigate(deckPath(saved.id), { replace: true })
    } catch {
      setError('This deck could not be added to your library. Please try again.')
      setAdding(false)
    }
  }

  if (loading) {
    return <main className="grid min-h-[65vh] place-items-center" aria-label="Loading deck portal"><span className="loading loading-spinner loading-lg text-primary" /></main>
  }

  if (!portal) {
    return (
      <main className="mx-auto grid min-h-[65vh] max-w-2xl place-items-center px-4 py-12">
        <section className="text-center" role="alert">
          <h1 className="text-3xl font-black">Portal unavailable</h1>
          <p className="mt-2 text-base-content/60">{error || PORTAL_INVALID_MESSAGE}</p>
          <Link to={paths.community} className="btn btn-primary mt-5">Return to Community</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <PortalPreview
        preview={{
          title: portal.snapshot.title,
          senderDisplayName: portal.ownerDisplayName,
          description: portal.snapshot.description,
          guideAvailable: Boolean(portal.snapshot.studyGuide),
          cardCount: portal.snapshot.cardCount,
          expiresAt: portal.expiresAt,
        }}
        adding={adding}
        error={error}
        onAddToLibrary={addToLibrary}
      />
    </main>
  )
}
