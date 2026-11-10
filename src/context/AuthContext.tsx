import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getAdditionalUserInfo, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { User, UserCredential } from 'firebase/auth'
import type { AccountRecord } from '../types/domain'
import { auth, googleProvider } from '../lib/firebase'
import { completeAccountOnboarding, getAccount } from '../lib/account'
import type { CompleteAccountOnboardingInput } from '../lib/account'
import { startPresenceSession } from '../lib/presence'
import type { PresenceSession } from '../lib/presence'
import { setDatabaseUser } from '../lib/db'
import { getErrorMessage, isRecord } from '../lib/errors'
import { GEMINI_API_KEY_STORAGE, GEMINI_MODEL_STORAGE } from '../lib/geminiSettings'

interface AuthContextValue {
  user: User | null
  account: AccountRecord | null
  loading: boolean
  accountLoading: boolean
  error: string
  accountError: string
  clearError: () => void
  signInWithGoogle: () => Promise<UserCredential>
  signUpWithGoogle: () => Promise<UserCredential>
  completeOnboarding: (input: CompleteAccountOnboardingInput) => Promise<AccountRecord>
  refreshAccount: () => Promise<AccountRecord | null>
  signOutUser: () => Promise<void>
}

interface AuthProviderProps {
  children: ReactNode
}

const AuthContext = createContext<AuthContextValue | null>(null)

const getFriendlyAuthError = (error: unknown): string => {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''

  if (code.includes('popup-closed')) return 'The sign-in window was closed before finishing.'
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow popups and try again.'
  if (code.includes('network-request-failed')) return 'A network error interrupted sign-in. Check your connection and try again.'

  return getErrorMessage(error, 'We could not sign you in. Please try again.')
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [account, setAccount] = useState<AccountRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [accountLoading, setAccountLoading] = useState(true)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')
  const presenceSessionRef = useRef<PresenceSession | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (nextUser: User | null) => {
        setDatabaseUser(nextUser?.uid || '')
        setUser(nextUser)
        setAccountError('')
        setLoading(false)
        if (!nextUser) {
          setAccount(null)
          setAccountLoading(false)
          return
        }
        setAccountLoading(true)
        try {
          setAccount(await getAccount(nextUser))
        } catch (accountLoadError: unknown) {
          setAccountError(getErrorMessage(accountLoadError, 'Your Kognit account could not be loaded.'))
          setAccount(null)
        } finally {
          setAccountLoading(false)
        }
      },
      (authError: Error) => {
        setError(getFriendlyAuthError(authError))
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const previousSession = presenceSessionRef.current
    presenceSessionRef.current = null
    void previousSession?.stop()
    if (!user || !account?.preferences.presence) return

    let active = true
    void startPresenceSession(user)
      .then((session) => {
        if (active) presenceSessionRef.current = session
        else void session.stop()
      })
      .catch(() => undefined)

    return () => {
      active = false
      const session = presenceSessionRef.current
      presenceSessionRef.current = null
      void session?.stop()
    }
  }, [account?.preferences.presence, user])

  const refreshAccount = async (): Promise<AccountRecord | null> => {
    if (!user) return null
    setAccountLoading(true)
    setAccountError('')
    try {
      const nextAccount = await getAccount(user)
      setAccount(nextAccount)
      return nextAccount
    } catch (accountLoadError: unknown) {
      setAccountError(getErrorMessage(accountLoadError, 'Your Kognit account could not be loaded.'))
      throw accountLoadError
    } finally {
      setAccountLoading(false)
    }
  }

  const handleCompleteOnboarding = async (
    input: CompleteAccountOnboardingInput,
  ): Promise<AccountRecord> => {
    if (!user) throw new Error('An authenticated user is required')
    setAccountError('')
    const nextAccount = await completeAccountOnboarding(user, input)
    setAccount(nextAccount)
    return nextAccount
  }

  const signInWithGoogle = async (): Promise<UserCredential> => {
    setError('')

    try {
      const credential = await signInWithPopup(auth, googleProvider)
      if (getAdditionalUserInfo(credential)?.isNewUser) {
        await signOut(auth)
        throw new Error('No Kognit account was found for this Google account. Use Sign up to create one.')
      }
      return credential
    } catch (authError: unknown) {
      const message = getFriendlyAuthError(authError)
      setError(message)
      throw new Error(message)
    }
  }

  const signUpWithGoogle = async (): Promise<UserCredential> => {
    setError('')

    try {
      const credential = await signInWithPopup(auth, googleProvider)
      if (!getAdditionalUserInfo(credential)?.isNewUser) {
        const existingAccount = await getAccount(credential.user)
        if (existingAccount) {
          await signOut(auth)
          throw new Error('This Google account already has a Kognit account. Use Sign in instead.')
        }
      }
      return credential
    } catch (authError: unknown) {
      const message = getFriendlyAuthError(authError)
      setError(message)
      throw new Error(message)
    }
  }

  const signOutUser = async (): Promise<void> => {
    setError('')

    try {
      await presenceSessionRef.current?.stop()
      localStorage.removeItem(GEMINI_API_KEY_STORAGE)
      localStorage.removeItem(GEMINI_MODEL_STORAGE)
      await signOut(auth)
    } catch (authError: unknown) {
      const message = getFriendlyAuthError(authError)
      setError(message)
      throw new Error(message)
    }
  }

  const value: AuthContextValue = {
    user,
    account,
    loading,
    accountLoading,
    error,
    accountError,
    clearError: () => setError(''),
    signInWithGoogle,
    signUpWithGoogle,
    completeOnboarding: handleCompleteOnboarding,
    refreshAccount,
    signOutUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) throw new Error('useAuth must be used within an AuthProvider')

  return context
}
