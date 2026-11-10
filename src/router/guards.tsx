import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import { createAuthRedirectState, getSafeRedirectTarget, paths } from './paths'

export function ProtectedRoute() {
  const { user, account, accountError, loading, accountLoading, refreshAccount } = useAuth()
  const location = useLocation()

  if (loading || accountLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate
      to={paths.signIn}
      replace
      state={createAuthRedirectState(location.pathname, location.search, location.hash)}
    />
  }
  if (accountError && !account) {
    return (
      <main className="grid min-h-screen place-items-center bg-base-200 px-4">
        <section className="alert alert-error block max-w-lg shadow-xl">
          <h1 className="font-bold">Your account could not be loaded</h1>
          <p className="mt-2 text-sm">{accountError}</p>
          <button type="button" className="btn btn-sm mt-4" onClick={() => void refreshAccount()}>Try again</button>
        </section>
      </main>
    )
  }
  if (!account) {
    return <Navigate
      to={paths.onboarding}
      replace
      state={createAuthRedirectState(location.pathname, location.search, location.hash)}
    />
  }

  return <Outlet />
}

export function GuestOnlyRoute() {
  const { user, account, accountError, loading, accountLoading, signOutUser } = useAuth()
  const location = useLocation()

  if (loading || (user && accountLoading)) return <LoadingScreen />
  if (user && accountError && !account) {
    return (
      <main className="grid min-h-screen place-items-center bg-base-200 px-4">
        <section className="alert alert-error block max-w-lg shadow-xl">
          <h1 className="font-bold">Your account could not be loaded</h1>
          <p className="mt-2 text-sm">{accountError}</p>
          <button type="button" className="btn btn-sm mt-4" onClick={() => void signOutUser()}>Use another account</button>
        </section>
      </main>
    )
  }
  if (user) {
    const state = location.state as { from?: unknown } | null
    return <Navigate
      to={account ? getSafeRedirectTarget(state?.from) : paths.onboarding}
      replace
      state={account ? undefined : { from: getSafeRedirectTarget(state?.from) }}
    />
  }

  return <Outlet />
}

export function OnboardingOnlyRoute() {
  const { user, account, accountError, loading, accountLoading, signOutUser } = useAuth()
  const location = useLocation()

  if (loading || accountLoading) return <LoadingScreen />
  if (!user) return <Navigate to={paths.signIn} replace state={location.state} />
  if (accountError && !account) {
    return (
      <main className="grid min-h-screen place-items-center bg-base-200 px-4">
        <section className="alert alert-error block max-w-lg shadow-xl">
          <h1 className="font-bold">Your account could not be loaded</h1>
          <p className="mt-2 text-sm">{accountError}</p>
          <button type="button" className="btn btn-sm mt-4" onClick={() => void signOutUser()}>Use another account</button>
        </section>
      </main>
    )
  }
  if (account) {
    const state = location.state as { from?: unknown } | null
    return <Navigate to={getSafeRedirectTarget(state?.from)} replace />
  }

  return <Outlet />
}
