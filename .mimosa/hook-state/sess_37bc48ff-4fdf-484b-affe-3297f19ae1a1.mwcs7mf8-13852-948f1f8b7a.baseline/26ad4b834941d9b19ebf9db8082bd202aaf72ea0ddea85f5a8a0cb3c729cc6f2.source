import { lazy, Suspense, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { GuestOnlyRoute, OnboardingOnlyRoute, ProtectedRoute } from './router/guards'
import { paths } from './router/paths'
import LoadingScreen from './router/LoadingScreen'

const SignInScreen = lazy(() => import('./components/SignInScreen'))
const SignUpScreen = lazy(() => import('./components/SignUpScreen'))
const Onboarding = lazy(() => import('./components/Onboarding'))
const PrivacyNotice = lazy(() => import('./components/PrivacyNotice'))
const AppShell = lazy(() => import('./routes/AppShell'))
const NotFoundRoute = lazy(() => import('./routes/NotFoundRoute'))
const PortalRoute = lazy(() => import('./routes/PortalRoute'))
const PublicPlayerRoute = lazy(() => import('./routes/PublicPlayerRoute'))
const OnlineDeckIndexRoute = lazy(() => import('./routes/OnlineDeckRoutes').then((module) => ({ default: module.OnlineDeckIndexRoute })))
const OnlineDeckRoute = lazy(() => import('./routes/OnlineDeckRoutes').then((module) => ({ default: module.OnlineDeckRoute })))
const OnlineDeckEditRoute = lazy(() => import('./routes/OnlineDeckRoutes').then((module) => ({ default: module.OnlineDeckEditRoute })))
const OnlineDeckStudyRoute = lazy(() => import('./routes/OnlineSeriesRoutes').then((module) => ({ default: module.OnlineDeckStudyRoute })))
const OnlineDeckContinuationRoute = lazy(() => import('./routes/OnlineSeriesRoutes').then((module) => ({ default: module.OnlineDeckContinuationRoute })))
const LocalDeckEditRoute = lazy(() => import('./routes/LocalDeckManagementRoutes').then((module) => ({ default: module.LocalDeckEditRoute })))
const LocalDeckRegenerateRoute = lazy(() => import('./routes/LocalDeckManagementRoutes').then((module) => ({ default: module.LocalDeckRegenerateRoute })))
const CommunityRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.CommunityRoute })))
const DashboardRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.DashboardRoute })))
const DeckLeaderboardRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.DeckLeaderboardRoute })))
const DeckRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.DeckRoute })))
const GlobalLeaderboardRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.GlobalLeaderboardRoute })))
const ImportRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.ImportRoute })))
const ProfileRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.ProfileRoute })))
const StudyRoute = lazy(() => import('./routes/routeScreens').then((module) => ({ default: module.StudyRoute })))

function AuthenticatedShell() {
  const { user } = useAuth()
  if (!user) return null
  return <AppShell user={user} />
}

function OnboardingRoute() {
  const { completeOnboarding, accountError } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  return <Onboarding
    saving={saving}
    error={error || accountError}
    onSubmit={async (submission) => {
      setSaving(true)
      setError('')
      try {
        await completeOnboarding({
          nickname: submission.nickname,
          acknowledgedPrivacyVersion: submission.acknowledgedPrivacyVersion,
          preferences: {
            discoverable: submission.discoverable,
            presence: submission.presence,
          },
        })
      } catch (onboardingError: unknown) {
        setError(onboardingError instanceof Error ? onboardingError.message : 'Your account could not be created.')
      } finally {
        setSaving(false)
      }
    }}
  />
}

export default function App() {
  return <Suspense fallback={<LoadingScreen />}>
    <Routes>
      <Route path={paths.privacy} element={<PrivacyNotice />} />
      <Route element={<GuestOnlyRoute />}>
        <Route path={paths.signIn} element={<SignInScreen />} />
        <Route path={paths.signUp} element={<SignUpScreen />} />
      </Route>
      <Route element={<OnboardingOnlyRoute />}>
        <Route path={paths.onboarding} element={<OnboardingRoute />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedShell />}>
          <Route index element={<DashboardRoute />} />
          <Route path="import" element={<ImportRoute />} />
          <Route path="community" element={<CommunityRoute />} />
          <Route path="leaderboards" element={<GlobalLeaderboardRoute />} />
          <Route path="profile" element={<ProfileRoute />} />
          <Route path="players/:playerId" element={<PublicPlayerRoute />} />
          <Route path="decks/:deckId" element={<DeckRoute />} />
          <Route path="decks/:deckId/edit" element={<LocalDeckEditRoute />} />
          <Route path="decks/:deckId/regenerate" element={<LocalDeckRegenerateRoute />} />
          <Route path="decks/:deckId/leaderboard" element={<DeckLeaderboardRoute />} />
          <Route path="decks/:deckId/study/due" element={<StudyRoute mode="scheduled" deckScoped />} />
          <Route path="decks/:deckId/study/practice" element={<StudyRoute mode="practice" deckScoped />} />
          <Route path="study/due" element={<StudyRoute mode="scheduled" deckScoped={false} />} />
          <Route path="portal/:code" element={<PortalRoute />} />
          <Route path="online-decks" element={<OnlineDeckIndexRoute />} />
          <Route path="online-decks/:deckId" element={<OnlineDeckRoute />} />
          <Route path="online-decks/:deckId/edit" element={<OnlineDeckEditRoute />} />
          <Route path="online-decks/:deckId/study" element={<OnlineDeckStudyRoute />} />
          <Route path="online-decks/:deckId/continue" element={<OnlineDeckContinuationRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  </Suspense>
}
