# iOS native extras (add in Xcode)

These Swift files can't be compiled without Xcode, so they live here as ready-to-add
sources. Add them after `npx cap add ios` opens the iOS project.

## 1. Register the deep-link URL scheme (required for both)

Main app target → **Info** → **URL Types** → add one with **URL Schemes = `expensetracker`**.
(Capacitor's `appUrlOpen` then fires when the app is opened via `expensetracker://add`,
and the web app routes to the Add screen — already wired in `app.tsx`.)

## 2. Built-in "Add Expense" action (Siri / Shortcuts / Back Tap)

Add **`AddExpenseIntent.swift`** to the **main app target** (drag into the App group in Xcode).
This publishes an **App Intent** so you can:
- assign **Settings → Accessibility → Back Tap → Add Expense** (no manual Shortcut!), and
- say *"Add expense in Expense Tracker"* to Siri.

## 3. Home-screen widget

1. **File → New → Target → Widget Extension** (e.g. name `ExpenseWidget`, uncheck "Include Configuration Intent").
2. Replace the generated widget source with **`ExpenseWidget.swift`**.
3. Build/run. Long-press the home screen → add the **Add Expense** widget. Tapping it opens the app to Add.

## Notes
- Everything targets iOS 16+ (App Intents) / 14+ (WidgetKit).
- These are optional polish — the app works fully without them; they just make quick entry faster.
- After adding, remember the free-Apple-ID **7-day re-sign** applies to the whole app incl. these extensions.
