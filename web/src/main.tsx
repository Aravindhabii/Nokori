import { render } from 'preact';
import { App } from './app';
import { applyTheme, getTheme } from './theme';
import './styles.css';

applyTheme(getTheme());

render(<App />, document.getElementById('app')!);
