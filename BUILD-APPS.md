# Building the native apps (iOS + Android)

The native apps are the **same Preact UI wrapped with Capacitor**, talking to your existing self-hosted backend. Adds: Face ID / fingerprint **app lock**, secure token storage (Keychain/Keystore), and (later phases) a built-in quick-add, local reminders, home-screen widget, and offline sync.

## 0. One-time: point the app at your backend

The native app is **not** served by your server, so it needs the absolute URL:

```bash
cd web
cp .env.example .env
# edit web/.env →  VITE_API_BASE_URL=https://expenses.yourdomain.com
```

Your backend must be reachable over **HTTPS from the phone** (your deployed domain — not `localhost`). Then always rebuild the web bundle before syncing:

```bash
npm install
npm run build
npx cap sync          # copies web/dist + plugins into ios/ and android/
```

Re-run `npm run build && npx cap sync` after any code change.

## Android (free, no expiry)

**Prereqs:** Android Studio + SDK, and a **JDK 17–21**. ⚠️ Android Studio here bundles **JDK 25, which Gradle rejects** — install JDK 21 and point to it:

```bash
brew install openjdk@21
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

**Build an APK from the CLI:**
```bash
cd web/android
./gradlew assembleDebug
# → web/android/app/build/outputs/apk/debug/app-debug.apk
```
Transfer the APK to your phone (AirDrop/USB/link), enable **Install unknown apps** for the source, and install.

**Or use Android Studio:** `npx cap open android` → set the JDK to 21 in Settings → Build/Run onto your device.

## iOS (free Apple ID → 7-day expiry)

**Prereqs:** **Xcode** + **CocoaPods** (`brew install cocoapods`).

```bash
cd web
npx cap add ios          # first time only (needs CocoaPods)
npx cap sync ios
npx cap open ios         # opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → Team = your **personal (free) Apple ID**; set a unique **Bundle Identifier** (e.g. `com.<you>.expensetracker`).
2. Plug in your iPhone, select it as the run target, press **▶ Run**.
3. On the phone, trust the developer cert: **Settings → General → VPN & Device Management**.
4. **Free account:** the app stops working after **7 days** — just press ▶ Run in Xcode again to refresh it.

## Using it

- Log in with your normal username/password (same accounts as the web app). 2FA works if enabled.
- **App lock:** Settings → **App lock** → Face ID / Fingerprint (on by default; re-locks when you background the app).
- Everything else — accounts, cards, EMIs, budget — is identical to the web app, backed by your encrypted server DB.

## Native features (all built)

- **App lock** — Face ID / fingerprint on launch + resume (Settings → App lock).
- **Daily reminder** — on-device local notification at a time you pick (Settings → Daily reminder). Tapping it opens the Add screen.
- **Quick-add (Android, built-in):** long-press the app icon → **Add expense**; a **home-screen widget** (long-press home screen → add the *Add Expense* widget). Both deep-link to the Add screen.
- **Quick-add (iOS):** ready-to-add Swift in **`web/ios-extras/`** — an **App Intent** (assign *Back Tap → Add Expense*, or Siri) and a **WidgetKit** widget. Add them in Xcode (see `web/ios-extras/README.md`) + register the `expensetracker` URL scheme in Info.plist.
- **Offline-first** — reads show last-known data with no connection; adding an expense offline **queues** (shows a "Pending"/"Offline" indicator) and **syncs automatically on reconnect**.

## Status

- **Phases A–D complete.** Web + Android verified here (APK builds; offline add→sync tested). iOS builds in your Xcode; the iOS quick-add/widget are the `ios-extras/` files to drop in.
- The debug APK built in this repo has **no backend URL baked in** — set `web/.env` (`VITE_API_BASE_URL`) and rebuild for a working app.
- **Android quick-add deep links use the `expensetracker://add` scheme** (already wired in the manifest). For iOS, register that scheme in Info.plist when you add the extras.
