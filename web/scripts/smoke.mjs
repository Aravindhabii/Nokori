import { webkit } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3997';
const OUT = '/tmp/et-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await shot('01-login');

// Sign up
await page.click('text=Need an account? Sign up');
await page.fill('input[autocomplete="username"]', 'smoke');
await page.fill('input[type="password"]', 'password123');
await page.fill('text=Signup code >> xpath=following-sibling::input, input >> nth=2', 'smokecode').catch(() => {});
// Fallback: fill the last visible input (signup code)
const inputs = await page.locator('form input').all();
if (inputs.length >= 3) await inputs[2].fill('smokecode');
await page.click('button:has-text("Sign up")');
await page.waitForSelector('.navbar', { timeout: 5000 });
await shot('02-add');

// Add an expense
await page.fill('input[type="number"]', '250.75');
await page.click('button:has-text("Add expense")');
await page.waitForSelector('.row', { timeout: 5000 });
await shot('03-history');

// Reports
await page.click('.navbar >> text=Reports');
await page.waitForTimeout(800);
await shot('04-reports');

// Settings (now the header gear) + generate token
await page.click('button[title="Settings"]');
await page.waitForSelector('text=API tokens');
await page.click('button:has-text("Generate")');
await page.waitForSelector('.token-reveal', { timeout: 5000 });
await shot('05-settings');

console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
await browser.close();
process.exit(errors.length ? 1 : 0);
