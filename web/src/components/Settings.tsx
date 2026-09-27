import { useEffect, useState } from 'preact/hooks';
import { api, clearSession, getUser, type ApiToken } from '../api';
import type { Theme } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { AccountManager } from './AccountManager';
import { CardManager } from './CardManager';
import { TwoFactor } from './TwoFactor';

export function Settings({
  onLogout,
  theme,
  onThemeChange,
}: {
  onLogout: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [label, setLabel] = useState('iPhone Shortcut');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  function load() {
    api<{ tokens: ApiToken[] }>('/api/tokens').then((r) => setTokens(r.tokens));
  }
  useEffect(load, []);

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ token: string }>('/api/tokens', { body: { label } });
      setNewToken(res.token);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      await api(`/api/tokens/${pendingRevoke.id}`, { method: 'DELETE' });
      setPendingRevoke(null);
      load();
    } finally {
      setRevoking(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function logout() {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession();
    onLogout();
  }

  const user = getUser() || '';

  return (
    <>
      <div class="section">
        <div class="section-label">Appearance</div>
        <div class="card glass" style={{ padding: '6px' }}>
          <div class="seg">
            <button class={theme === 'dark' ? 'on' : ''} onClick={() => onThemeChange('dark')}>
              ☾ Dark
            </button>
            <button class={theme === 'light' ? 'on' : ''} onClick={() => onThemeChange('light')}>
              ☀ Light
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Account</div>
        <div class="account glass">
          <div class="account-row">
            <div class="avatar">{user.slice(0, 1).toUpperCase()}</div>
            <div class="muted">
              Signed in as <strong style={{ color: 'var(--text)' }}>{user}</strong>
            </div>
          </div>
          <button class="account-logout" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Accounts</div>
        <AccountManager />
      </div>

      <div class="section">
        <div class="section-label">Credit cards</div>
        <CardManager />
      </div>

      <div class="section">
        <div class="section-label">Two-factor authentication</div>
        <TwoFactor />
      </div>

      <div class="section">
        <div class="section-label">API tokens (for the iOS Shortcut)</div>
        <div class="token-card glass">
          <div class="muted" style={{ fontSize: '14px', lineHeight: 1.5 }}>
            Generate a token, then paste it into your Back Tap Shortcut's Authorization header. Treat it like a
            password.
          </div>

          {newToken && (
            <div class="token-reveal">
              <span style={{ fontSize: '13px' }}>Copy this now — it won't be shown again:</span>
              <code>{newToken}</code>
              <button class="btn-primary compact" onClick={copy}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          )}

          <form class="token-row" onSubmit={create}>
            <input class="field" value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} placeholder="Label" />
            <button class="btn-primary compact" disabled={busy} type="submit">
              {busy ? '…' : 'Generate'}
            </button>
          </form>

          <div class="divider" />

          {tokens.length === 0 ? (
            <div class="muted" style={{ fontSize: '15px' }}>
              No tokens yet.
            </div>
          ) : (
            tokens.map((t) => (
              <div class="token-item">
                <div class="info">
                  <div class="name">{t.label}</div>
                  <div class="val">
                    Created {t.created_at.slice(0, 10)}
                    {t.last_used_at ? ` · last used ${t.last_used_at.slice(0, 10)}` : ' · never used'}
                  </div>
                </div>
                <button class="btn-revoke" onClick={() => setPendingRevoke(t)}>
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {pendingRevoke && (
        <ConfirmDialog
          title="Revoke token?"
          message={`"${pendingRevoke.label}" will stop working immediately. Any Shortcut using it will need a new token.`}
          confirmLabel="Revoke"
          danger
          busy={revoking}
          onConfirm={confirmRevoke}
          onCancel={() => setPendingRevoke(null)}
        />
      )}
    </>
  );
}
