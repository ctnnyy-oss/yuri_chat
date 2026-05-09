import { useCallback, useEffect, useState } from 'react'
import {
  fetchCurrentAccount,
  getSavedSessionToken,
  isEmailVerificationPending,
  loginAccount,
  logoutAccount,
  registerAccount,
  resendAccountVerification,
  saveSessionToken,
  verifyAccountEmail,
  type EmailVerificationPendingPayload,
  type AccountUser,
} from '../services/accountAuth'

type AccountStatus = 'checking' | 'signed-out' | 'signed-in'

export function useAccountSession() {
  const [token, setToken] = useState(() => getSavedSessionToken())
  const [status, setStatus] = useState<AccountStatus>(() => (getSavedSessionToken() ? 'checking' : 'signed-out'))
  const [user, setUser] = useState<AccountUser | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingVerification, setPendingVerification] = useState<EmailVerificationPendingPayload | null>(null)

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
      if (isEmailVerificationPending(payload)) {
        setPendingVerification(payload)
        setMessage(payload.devVerificationCode ? `本地测试验证码：${payload.devVerificationCode}` : '验证码已经发到邮箱啦。')
        setStatus('signed-out')
        return
      }
      saveSessionToken(payload.token)
      setToken(payload.token)
      setUser(payload.user)
      setPendingVerification(null)
      setStatus('signed-in')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(async (input: { username: string; email: string; password: string; displayName?: string }) => {
    setBusy(true)
    setMessage('')
    try {
      const payload = await registerAccount(input)
      if (isEmailVerificationPending(payload)) {
        setPendingVerification(payload)
        setMessage(payload.devVerificationCode ? `本地测试验证码：${payload.devVerificationCode}` : '验证码已经发到邮箱啦。')
        setStatus('signed-out')
        return
      }
      saveSessionToken(payload.token)
      setToken(payload.token)
      setUser(payload.user)
      setPendingVerification(null)
      setStatus('signed-in')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '注册失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const verifyEmail = useCallback(async (input: { email: string; code: string }) => {
    setBusy(true)
    setMessage('')
    try {
      const payload = await verifyAccountEmail(input)
      saveSessionToken(payload.token)
      setToken(payload.token)
      setUser(payload.user)
      setPendingVerification(null)
      setStatus('signed-in')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邮箱验证失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    setBusy(true)
    setMessage('')
    try {
      const payload = await resendAccountVerification({ email })
      setPendingVerification(payload)
      setMessage(payload.devVerificationCode ? `本地测试验证码：${payload.devVerificationCode}` : '新的验证码已经发到邮箱啦。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证码发送失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  const cancelVerification = useCallback(() => {
    setPendingVerification(null)
    setMessage('')
  }, [])

  const signOut = useCallback(async () => {
    const currentToken = token
    saveSessionToken('')
    setToken('')
    setUser(null)
    setPendingVerification(null)
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
    pendingVerification,
    status,
    token,
    user,
    setMessage,
    cancelVerification,
    resendVerification,
    signIn,
    signOut,
    signUp,
    verifyEmail,
  }
}
