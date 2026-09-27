import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getToken } from './api';
import { applyTheme, getTheme, type Theme } from './theme';
import { Login } from './components/Login';
import { QuickAdd } from './components/QuickAdd';
import { EntryList } from './components/EntryList';
import { Dashboard } from './components/Dashboard';
import { Accounts } from './components/Accounts';
import { Budget } from './components/Budget';
import { Settings } from './components/Settings';

type Tab = 'add' | 'history' | 'reports' | 'accounts' | 'budget' | 'settings';

const svg = (paths: JSX.Element, w = 22) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    {paths}
  </svg>
);

const NAV: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'add', label: 'Add', icon: svg(<path d="M12 5v14M5 12h14" />) },
  { id: 'history', label: 'History', icon: svg(<path d="M5 7h14M5 12h14M5 17h14" />) },
  { id: 'reports', label: 'Reports', icon: svg(<path d="M6 19V11M12 19V5M18 19v-6" />) },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: svg(
      <>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <circle cx="16.5" cy="14" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    id: 'budget',
    label: 'Budget',
    icon: svg(
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.2" />
      </>
    ),
  },
];

// A proper lobed cog (not a spoky circle, which reads like a sun).
const gearIcon = svg(
  <>
    <circle cx="12" cy="12" r="3.3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.3a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H1.6a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 3.3 8.6a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7.6A1.6 1.6 0 0 0 9 3.1V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.4.9z" />
  </>,
  19
);
const sunIcon = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    <path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
  </svg>
);
const moonIcon = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

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
          <div class="topbar-actions">
            <button
              class="icon-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? sunIcon : moonIcon}
            </button>
            <button
              class={`icon-btn ${tab === 'settings' ? 'on' : ''}`}
              title="Settings"
              onClick={() => setTab('settings')}
            >
              {gearIcon}
            </button>
          </div>
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
        {tab === 'accounts' && <Accounts version={version} onChange={bump} />}
        {tab === 'budget' && <Budget />}
        {tab === 'settings' && <Settings onLogout={onLogout} theme={theme} onThemeChange={setTheme} />}
      </main>

      <nav class="navbar glass">
        {NAV.map((t) => (
          <button class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
