import { render } from 'preact';
import { App } from './app';
import { applyTheme, getTheme } from './theme';
import { initSession, syncNow } from './api';
import './styles.css';

applyTheme(getTheme());

// Load the persisted session (keychain on native) before the first render so
// getToken() is populated when <App> decides logged-in vs login screen.
initSession().finally(() => {
  render(<App />, document.getElementById('app')!);
  void syncNow(); // flush any entries queued while offline last time
});
