// Tiny cross-component navigation bus so deep links / notifications / app shortcuts
// can jump straight to a tab, even if the app is cold-starting or locked.
type Tab = 'add' | 'history' | 'reports' | 'accounts' | 'budget' | 'settings';

let pending: Tab | null = null;

export function requestTab(tab: Tab) {
  pending = tab;
  window.dispatchEvent(new CustomEvent('et-nav', { detail: tab }));
}

/** Read + clear a tab requested before the main UI mounted (cold start / post-unlock). */
export function consumePendingTab(): Tab | null {
  const t = pending;
  pending = null;
  return t;
}
