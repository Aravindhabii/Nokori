import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import { api } from '../api';

export function TwoFactor() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'idle' | 'setup' | 'disable'>('idle');

  useEffect(() => {
    api<{ enabled: boolean }>('/api/2fa/status').then((r) => setEnabled(r.enabled));
  }, []);

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ secret: string; otpauth: string }>('/api/2fa/setup', { method: 'POST' });
      setSecret(r.secret);
      setQr(await QRCode.toDataURL(r.otpauth, { margin: 1, width: 200 }));
      setMode('setup');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setError('');
    try {
      await api('/api/2fa/enable', { body: { code } });
      setEnabled(true);
      setMode('idle');
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError('');
    try {
      await api('/api/2fa/disable', { body: { code } });
      setEnabled(false);
      setMode('idle');
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return <div class="token-card glass muted">Loading…</div>;

  return (
    <div class="token-card glass">
      <div class="muted" style={{ fontSize: '14px' }}>
        Two-factor auth is optional. When on, login also asks for a 6-digit code from your authenticator app.
      </div>
      {error && <div class="error">{error}</div>}

      {enabled ? (
        mode === 'disable' ? (
          <>
            <input class="field" inputMode="numeric" placeholder="Current 6-digit code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
            <div class="modal-actions">
              <button class="btn-ghost" onClick={() => { setMode('idle'); setCode(''); }}>Cancel</button>
              <button class="btn-danger" disabled={busy} onClick={disable}>{busy ? '…' : 'Turn off 2FA'}</button>
            </div>
          </>
        ) : (
          <div class="two-fa-on">
            <span class="pill-tag">On</span>
            <button class="mini-btn danger" onClick={() => setMode('disable')}>Disable</button>
          </div>
        )
      ) : mode === 'setup' ? (
        <>
          <p class="small muted" style={{ margin: 0 }}>
            Scan with your authenticator app (or enter the key manually), then type the 6-digit code to confirm.
          </p>
          {qr && <img src={qr} alt="2FA QR" class="qr" />}
          <code class="secret">{secret}</code>
          <input class="field" inputMode="numeric" placeholder="6-digit code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
          <div class="modal-actions">
            <button class="btn-ghost" onClick={() => { setMode('idle'); setCode(''); }}>Cancel</button>
            <button class="btn-primary" disabled={busy} onClick={enable}>{busy ? '…' : 'Verify & enable'}</button>
          </div>
        </>
      ) : (
        <button class="btn-primary" disabled={busy} onClick={startSetup}>
          {busy ? '…' : 'Enable 2FA'}
        </button>
      )}
    </div>
  );
}
