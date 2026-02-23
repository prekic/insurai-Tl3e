import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './config'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName?: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const isConfigured = isSupabaseConfigured()

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }

    let isMounted = true
    let unsubscribeFn: (() => void) | null = null

    // Load supabase dynamically to avoid bundling it eagerly
    import('@/lib/supabase/client')
      .then(({ supabase }) => {
        if (!isMounted) return

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!isMounted) return
          setSession(session)
          setUser(session?.user ?? null)
          setLoading(false)
        })

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!isMounted) return
          setSession(session)
          setUser(session?.user ?? null)
        })

        unsubscribeFn = () => subscription.unsubscribe()
      })
      .catch((err) => {
        console.error('Failed to load Supabase client', err)
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
      if (unsubscribeFn) {
        unsubscribeFn()
      }
    }
  }, [isConfigured])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const auth = await import('@/lib/supabase/auth')
      await auth.signIn(email, password)
    } finally {
      setLoading(false)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    setLoading(true)
    try {
      const auth = await import('@/lib/supabase/auth')
      await auth.signUp(email, password, fullName)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await import('@/lib/supabase/auth')
      await auth.signOut()
    } finally {
      setLoading(false)
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const auth = await import('@/lib/supabase/auth')
    await auth.signInWithProvider('google')
  }, [])

  const signInWithGithub = useCallback(async () => {
    const auth = await import('@/lib/supabase/auth')
    await auth.signInWithProvider('github')
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isConfigured,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
        signInWithGithub,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
