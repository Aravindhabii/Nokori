import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getToken } from './api';
import { applyTheme, getTheme, type Theme } from './theme';
import { Login } from './components/Login';
import { QuickAdd } from './components/QuickAdd';
import { EntryList } from './components/EntryList';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';

type Tab = 'add' | 'history' | 'reports' | 'settings';

const svg = (paths: JSX.Element) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    {paths}
  </svg>
);

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'add', label: 'Add', icon: svg(<path d="M12 5v14M5 12h14" />) },
  { id: 'history', label: 'History', icon: svg(<path d="M5 7h14M5 12h14M5 17h14" />) },
  { id: 'reports', label: 'Reports', icon: svg(<path d="M6 19V11M12 19V5M18 19v-6" />) },
  {
    id: 'settings',
    label: 'Settings',
    icon: svg(
      <>
        <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
        <circle cx="16" cy="8" r="2" />
        <circle cx="8" cy="16" r="2" />
      </>
    ),
  },
];

export function App() {
  const [authed, setAuthed] = useState(!!getToken());

  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener('et-logout', onLogout);
    return () => window.removeEventListener('et-logout', onLogout);
  }, []);

  return (
    <>
      <div class="ambient" />
      {authed ? <Main onLogout={() => setAuthed(false)} /> : <Login onAuth={() => setAuthed(true)} />}
    </>
  );
}

function Main({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('add');
  const [version, setVersion] = useState(0);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const bump = () => setVersion((v) => v + 1);

  function setTheme(t: Theme) {
    applyTheme(t);
    setThemeState(t);
  }

  return (
    <div class="app">
      <header class="topbar">
        <div class="topbar-inner glass">
          <div class="brand">
            <div class="brand-logo" />
            <div class="brand-title">Expense Tracker</div>
          </div>
          <button
            class="icon-btn"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main class="content">
        {tab === 'add' && (
          <>
            <QuickAdd
              onAdded={() => {
                bump();
                setTab('history');
              }}
            />
            <div class="hint">
              Tip: set up the Back Tap Shortcut (see SETUP-IOS.md) to add entries without opening the app.
            </div>
          </>
        )}
        {tab === 'history' && <EntryList version={version} onChange={bump} />}
        {tab === 'reports' && <Dashboard version={version} />}
        {tab === 'settings' && <Settings onLogout={onLogout} theme={theme} onThemeChange={setTheme} />}
      </main>

      <nav class="navbar glass">
        {TABS.map((t) => (
          <button class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
