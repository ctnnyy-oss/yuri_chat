import { Heart, LogIn, UserPlus } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'

interface AuthPanelProps {
  busy: boolean
  message: string
  status: 'checking' | 'signed-out' | 'signed-in'
  onLogin: (input: { username: string; password: string }) => Promise<void>
  onRegister: (input: { username: string; password: string; displayName?: string }) => Promise<void>
}

export function AuthPanel({ busy, message, status, onLogin, onRegister }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('妹妹')
  const [displayName, setDisplayName] = useState('妹妹')
  const [password, setPassword] = useState('')
  const [localMessage, setLocalMessage] = useState('')
  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalMessage('')
    const cleanedUsername = username.trim()
    const cleanedPassword = password.trim()
    if (!cleanedUsername || !cleanedPassword) {
      setLocalMessage('先填用户名和密码，姐姐才能开门。')
      return
    }
    if (cleanedPassword.length < 8) {
      setLocalMessage('密码至少 8 位，别太短啦。')
      return
    }

    if (isRegister) {
      await onRegister({ username: cleanedUsername, password: cleanedPassword, displayName: displayName.trim() })
      return
    }
    await onLogin({ username: cleanedUsername, password: cleanedPassword })
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="账号登录">
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <Heart size={22} />
          </span>
          <div>
            <strong>Yuri Chat</strong>
            <small>百合小窝账号</small>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="账号入口">
          <button className={!isRegister ? 'active' : ''} onClick={() => setMode('login')} type="button">
            <LogIn size={16} />
            登录
          </button>
          <button className={isRegister ? 'active' : ''} onClick={() => setMode('register')} type="button">
            <UserPlus size={16} />
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>用户名</span>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="妹妹"
              value={username}
            />
          </label>

          {isRegister && (
            <label>
              <span>昵称</span>
              <input
                autoComplete="nickname"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="显示在小窝顶部"
                value={displayName}
              />
            </label>
          )}

          <label>
            <span>密码</span>
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              type="password"
              value={password}
            />
          </label>

          <button className="auth-submit" disabled={busy || status === 'checking'} type="submit">
            {busy || status === 'checking' ? '正在开门...' : isRegister ? '创建账号' : '进入小窝'}
          </button>
        </form>

        {(localMessage || message) && <p className="auth-message">{localMessage || message}</p>}
        <p className="auth-note">登录后，角色、对话、记忆和模型保险箱会按账号分开保存。</p>
      </section>
    </main>
  )
}
