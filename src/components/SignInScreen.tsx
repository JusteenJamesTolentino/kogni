import { motion } from 'framer-motion'
import { BrainCircuit, LogIn, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSafeRedirectTarget, paths } from '../router/paths'

export interface AuthScreenProps {
  mode?: 'signIn' | 'signUp'
}

export default function SignInScreen({ mode = 'signIn' }: AuthScreenProps) {
  const { signInWithGoogle, signUpWithGoogle, error, clearError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [signingIn, setSigningIn] = useState(false)

  const handleSignIn = async (): Promise<void> => {
    clearError()
    setSigningIn(true)

    try {
      if (mode === 'signUp') await signUpWithGoogle()
      else await signInWithGoogle()
      const state = location.state as { from?: unknown } | null
      navigate(getSafeRedirectTarget(state?.from), { replace: true })
    } catch {
      setSigningIn(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-base-200 px-4 py-12">
      <div className="pointer-events-none absolute -left-32 top-[-8rem] h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-secondary/20 blur-3xl" />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="card z-10 w-full max-w-md border border-base-300 bg-base-100 shadow-2xl"
        aria-labelledby="welcome-title"
      >
        <div className="card-body items-center px-6 py-10 text-center sm:px-10">
          <div className="mb-2 grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/30">
            <BrainCircuit size={34} aria-hidden="true" />
          </div>
          <div className="badge badge-primary badge-outline mb-2 gap-1.5">
            <Sparkles size={13} aria-hidden="true" />
            AI-powered active recall
          </div>
            <h1 id="welcome-title" className="text-3xl font-black tracking-tight sm:text-4xl">
              {mode === 'signUp' ? 'Start learning.' : <>Learn once.<br />Remember longer.</>}
            </h1>
          <p className="mt-2 max-w-sm text-base-content/65">Turn any document into focused flashcards, then master them with adaptive spaced repetition.</p>

          {error && (
            <div role="alert" className="alert alert-error mt-4 text-left text-sm">
              <span>{error}</span>
            </div>
          )}

          <button type="button" onClick={() => void handleSignIn()} disabled={signingIn} className="btn btn-primary mt-5 w-full gap-3">
            {signingIn ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <LogIn size={20} aria-hidden="true" />}
            {signingIn ? 'Connecting…' : mode === 'signUp' ? 'Sign up with Google' : 'Sign in with Google'}
          </button>
          <p className="mt-2 text-xs text-base-content/45">Google is the only supported sign-in method.</p>
          <p className="mt-4 text-sm text-base-content/60">
            {mode === 'signUp' ? 'Already have an account?' : 'New to Kognit?'}{' '}
            <Link className="link link-primary font-semibold" to={mode === 'signUp' ? paths.signIn : paths.signUp}>
              {mode === 'signUp' ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </motion.section>
    </main>
  )
}
