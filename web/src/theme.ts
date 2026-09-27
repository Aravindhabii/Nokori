export type Theme = 'dark' | 'light';

const KEY = 'et_theme';

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark'; // default: dark
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f172a' : '#0D9488');
}
