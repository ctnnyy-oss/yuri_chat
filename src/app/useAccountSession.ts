import { useCallback, useEffect, useState } from 'react'
import {
  fetchCurrentAccount,
  getSavedSessionToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  saveSessionToken,
  type AccountUser,
} from '../services/accountAuth'

type AccountStatus = 'checking' | 'signed-out' | 'signed-in'

export function useAccountSession() {
  const [token, setToken] = useState(() => getSavedSessionToken())
  const [status, setStatus] = useState<AccountStatus>(() => (getSavedSessionToken() ? 'checking' : 'signed-out'))
  const [user, setUser] = useState<AccountUser | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const savedToken = token
    if (!savedToken) {
      return
    }

    void fetchCurrentAccount(savedToken)
      .then((currentUser) => {
        if (cancelled) return
        if (currentUser) {
          setUser(currentUser)
          setStatus('signed-in')
        } else {
          saveSessionToken('')
          setToken('')
          setUser(null)
          setStatus('signed-out')
        }
      })
      .catch((error) => {
        if (cancelled) return
        saveSessionToken('')
        setToken('')
        setUser(null)
        setMessage(error instanceof Error ? error.message : '登录状态已失效。')
        setStatus('signed-out')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const signIn = useCallback(async (input: { username: string; password: string }) => {
    setBusy(true)
    setMessage('')
    try {
      const payload = await loginAccount(input)
      saveSessionToken(payload.token)
      setToken(payload.token)
      setUser(payload.user)
      setStatus('signed-in')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(async (input: { username: string; password: string; displayName?: string }) => {
    setBusy(true)
    setMessage('')
    try {
      const payload = await registerAccount(input)
      saveSessionToken(payload.token)
      setToken(payload.token)
      setUser(payload.user)
      setStatus('signed-in')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '注册失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    const currentToken = token
    saveSessionToken('')
    setToken('')
    setUser(null)
    setStatus('signed-out')
    setMessage('')
    try {
      await logoutAccount(currentToken)
    } catch {
      // 本地已经退出；远端 session 清理失败时不阻塞妹妹继续使用。
    }
  }, [token])

  return {
    busy,
    message,
    status,
    token,
    user,
    setMessage,
    signIn,
    signOut,
    signUp,
  }
}
