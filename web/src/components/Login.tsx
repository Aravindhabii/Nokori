import { useState } from 'preact/hooks';
import { api, setSession } from '../api';

export function Login({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const body =
        mode === 'login'
          ? { username, password, ...(needTotp ? { code: totp } : {}) }
          : { username, password, signup_code: signupCode };
      const res = await api<{ token: string; username: string }>(path, { body });
      setSession(res.token, res.username);
      onAuth();
    } catch (err) {
      const data = (err as Error & { data?: { twofa_required?: boolean } }).data;
      if (data?.twofa_required) setNeedTotp(true);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="auth-screen">
      <div class="auth-card glass">
        <div class="auth-brand">
          <div class="brand-logo" />
          <h1>Expense Tracker</h1>
          <p class="muted">{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>
        </div>
        <form onSubmit={submit}>
          <div class="field-group">
            <span class="field-label">Username</span>
            <input
              class="field"
              value={username}
              autocomplete="username"
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              required
            />
          </div>
          <div class="field-group">
            <span class="field-label">Password</span>
            <input
              class="field"
              type="password"
              value={password}
              autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              required
            />
          </div>
          {mode === 'signup' && (
            <div class="field-group">
              <span class="field-label">Signup code</span>
              <input
                class="field"
                value={signupCode}
                onInput={(e) => setSignupCode((e.target as HTMLInputElement).value)}
                required
              />
            </div>
          )}
          {mode === 'login' && needTotp && (
            <div class="field-group">
              <span class="field-label">Authenticator code</span>
              <input
                class="field"
                inputMode="numeric"
                autocomplete="one-time-code"
                placeholder="6-digit code"
                value={totp}
                onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
                autofocus
                required
              />
            </div>
          )}
          {error && <div class="error">{error}</div>}
          <button class="btn-primary" disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <button
          class="link"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'signup' : 'login');
          }}
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
