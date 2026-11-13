// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import type { AppShellContextValue } from '../../src/routes/AppShell'

const mocks = vi.hoisted(() => ({
  createPrivateDeck: vi.fn(),
  deckIdCounter: 0,
}))

vi.mock('../../src/lib/cloudDecks', () => ({
  createCloudReviewSaver: vi.fn(),
  createPrivateDeck: mocks.createPrivateDeck,
  loadCloudDeck: vi.fn(),
  loadCloudLibrary: vi.fn(),
  newCloudDeckId: () => `deck-${++mocks.deckIdCounter}`,
}))
vi.mock('../../src/lib/social', () => ({ getSocialSummary: vi.fn() }))

// Heavy child components pull in Firebase side effects; the route logic under test only
// needs the creation entry points, so stub every rendered component.
vi.mock('../../src/components/Community', () => ({ default: () => null }))
vi.mock('../../src/components/Dashboard', () => ({ default: () => null }))
vi.mock('../../src/components/DeckList', () => ({ default: () => null }))
vi.mock('../../src/components/Leaderboard', () => ({ default: () => null }))
vi.mock('../../src/components/Profile', () => ({ default: () => null }))
vi.mock('../../src/components/StudySession', () => ({ default: () => null }))
vi.mock('../../src/components/MagicImport', () => ({
  default: function MagicImportStub({ onComplete }: { onComplete: (draft: unknown) => Promise<void> | void }) {
    return <button type="button" onClick={() => void onComplete(DRAFT)}>magic-save</button>
  },
}))
vi.mock('../../src/components/DeckEditor', () => ({
  default: function DeckEditorStub({ onCancel, onSave, saveError }: {
    onCancel: () => void
    onSave: (draft: unknown, context: unknown) => void | Promise<void>
    saveError?: string
  }) {
    return (
      <div>
        <span>editor-stub</span>
        {saveError ? <span role="alert">{saveError}</span> : null}
        <button type="button" onClick={() => void onSave(DRAFT, [])}>save-draft</button>
        <button type="button" onClick={onCancel}>cancel-editor</button>
      </div>
    )
  },
}))

import { MyDecksRoute } from '../../src/routes/routeScreens'

const DRAFT = { title: 'Test deck', description: '', studyGuide: '', cards: [{ id: 'c1', question: 'Q', answer: 'A', distractors: [] }] }
const user = { uid: 'tester' } as User

function stubContext(): AppShellContextValue {
  return {
    user,
    decks: [],
    dueCards: [],
    libraryLoading: false,
    libraryError: '',
    apiKey: '',
    geminiModel: 'stub',
    loadLibrary: vi.fn().mockResolvedValue(undefined),
    setImportBusy: vi.fn(),
    openApiKeyModal: vi.fn(),
  } as unknown as AppShellContextValue
}

function renderDecks(initialPath = '/decks') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Outlet context={stubContext()} />}>
          <Route path="/decks" element={<MyDecksRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const savedDeckIds = (): string[] => mocks.createPrivateDeck.mock.calls.map((call) => call[2] as string)

beforeEach(() => {
  mocks.deckIdCounter = 0
  mocks.createPrivateDeck.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('MyDecksRoute draft save-ID lifecycle (B16 regression)', () => {
  it('issues a fresh deck ID after an interrupted save forces a new draft session', async () => {
    // First attempt: the write lands server-side but the client observes a timeout,
    // which is exactly the interrupted-save scenario that used to wedge all later drafts.
    mocks.createPrivateDeck.mockRejectedValueOnce(new Error('timeout — it may still finish'))
    renderDecks()

    fireEvent.click(screen.getByText('New deck'))
    fireEvent.click(screen.getByText('save-draft'))
    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toBeTruthy()

    // Back out and start a brand-new draft: it must not inherit the occupied ID.
    fireEvent.click(screen.getByText('cancel-editor'))
    fireEvent.click(screen.getByText('New deck'))
    mocks.createPrivateDeck.mockResolvedValueOnce({ id: 'saved-deck' })
    fireEvent.click(screen.getByText('save-draft'))

    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(2))
    const [firstId, secondId] = savedDeckIds()
    expect(secondId).not.toBe(firstId)
  })

  it('keeps the deck ID stable across retries of the same draft so interrupted saves resume', async () => {
    mocks.createPrivateDeck
      .mockRejectedValueOnce(new Error('timeout — it may still finish'))
      .mockResolvedValueOnce({ id: 'saved-deck' })
    renderDecks()

    fireEvent.click(screen.getByText('New deck'))
    fireEvent.click(screen.getByText('save-draft'))
    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('save-draft'))

    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(2))
    const [firstId, retryId] = savedDeckIds()
    expect(retryId).toBe(firstId)
  })

  it('issues a fresh deck ID when switching between manual and AI creation flows', async () => {
    renderDecks()

    // Manual draft session.
    fireEvent.click(screen.getByText('New deck'))
    fireEvent.click(screen.getByText('save-draft'))
    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(1))
    const [manualId] = savedDeckIds()

    // AI import session in the same visit must not reuse the manual draft's ID.
    fireEvent.click(screen.getByText('cancel-editor'))
    fireEvent.click(screen.getByText('Magic Import'))
    mocks.createPrivateDeck.mockResolvedValueOnce({ id: 'saved-deck' })
    fireEvent.click(screen.getByText('magic-save'))
    await waitFor(() => expect(mocks.createPrivateDeck).toHaveBeenCalledTimes(2))
    const [, aiId] = savedDeckIds()
    expect(aiId).not.toBe(manualId)
  })
})
