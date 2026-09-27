# iOS & Mac Setup — quick entry with a double-tap

This is the magic that makes the tracker effortless: **double-tap the back of your iPhone → a Shortcut asks for the amount → it's saved instantly**, without opening any app.

> These are one-time manual steps on your device (Shortcuts can't be auto-installed).
> Do them once and you're set.

---

## 0. Add the app to your Home Screen (both devices)

**iPhone:** open `https://<your-domain>` in **Safari** → Share button → **Add to Home Screen**.
**Mac:** open it in **Safari** → Share → **Add to Dock** (macOS Sonoma / Safari 17+).

Log in on each device. (On older macOS, just bookmark it — the app still works.)

---

## 1. Get your API token

1. In the app, go to **Settings → API tokens**.
2. Enter a label (e.g. `iPhone Shortcut`) and tap **Generate**.
3. **Copy the token now** — it's shown only once. Keep it handy for the next step.

---

## 2. Build the "Add Expense" Shortcut (iPhone)

> **Important:** Do **not** hand-type the JSON body as text. Use a **Dictionary** action and send it as JSON — Shortcuts then quotes and escapes every value for you (so a note with a comma, quote, or emoji can't break the request). We also check the response so you never get a false "Saved".

Open the **Shortcuts** app → **+** to create a new shortcut. Add these actions in order:

1. **Ask for Input**
   - Prompt: `Amount ₹` · Input Type: **Number**
   - (This produces a variable called *Provided Input* — rename it to **Amount** if you like.)
2. **Choose from List** ← *use this, not "Choose from Menu"*
   - Tap to add the list items: `Food`, `Transport`, `Groceries`, `Bills`, `Shopping`, `Health`, `Entertainment`, `Other`.
   - Its output variable is **Chosen Item**.
3. **Ask for Input**
   - Prompt: `Note (optional)` · Input Type: **Text**
   - Turn **off** "Required" so you can leave it blank.
4. **Dictionary** — add these four keys (tap the blue variable chips to insert values; don't type variable names literally):
   | Key        | Type   | Value                          |
   |------------|--------|--------------------------------|
   | `type`     | Text   | `expense`                      |
   | `amount`   | Number | *Amount* (from step 1)         |
   | `category` | Text   | *Chosen Item* (from step 2)    |
   | `note`     | Text   | *Provided Input* (from step 3) |
5. **Get Contents of URL**
   - URL: `https://<your-domain>/api/entries`
   - Method: **POST**
   - Request Body: **JSON** → select the **Dictionary** from step 4.
   - Headers:
     - `Authorization` : `Bearer <paste-your-token>`
     - (Content-Type is set to `application/json` automatically when Body is JSON.)
6. **If** — check the request succeeded before celebrating:
   - Condition: **Contents of URL** *has any value* **and** *does not contain* `error`.
   - **If true:** *Show Notification* → `Saved ₹` + *Amount* + ` ✓`
   - **Otherwise:** *Show Notification* → `Failed to save ✗ — open the app` (and optionally *Show Result* of *Contents of URL* to see why).
   - (A successful create returns the new entry as JSON, which contains `"id"` and no `error`. A failure returns `{"error":...}`.)

Name the shortcut **Add Expense** and save.

**Test it:** run the shortcut from the Shortcuts app. Enter an amount, pick a category, optionally a note with a comma or quote in it. You should see "Saved ✓", and the entry should appear in the app's **History** tab. Then deliberately break it once (wrong token) to confirm you get "Failed to save ✗" rather than a false success.

---

## 3. Bind it to Back Tap (iPhone)

1. **Settings → Accessibility → Touch → Back Tap**.
2. Tap **Double Tap**.
3. Under *Shortcuts*, choose **Add Expense**.

Now double-tapping the back of your phone runs the quick-entry flow anywhere. 🎉

---

## 4. Daily reminder — so you never forget

A time-based automation nudges you every evening (more reliable on iOS than web push).

1. Shortcuts app → **Automation** tab → **+** → **Create Personal Automation**.
2. Choose **Time of Day** → set e.g. **9:00 PM**, repeat **Daily**.
3. Action: **Show Notification** → `Log today's spending 💸` (or run the **Add Expense** shortcut directly).
4. Turn **on** *Run Immediately* and turn **off** *Ask Before Running*.

---

## 5. Quick entry on the Mac

Back Tap is iPhone-only. On the Mac you have two options:

- Just use the **PWA** (it's in your Dock) — the Add tab is one click away.
- Or open the **Shortcuts** app on Mac, recreate the same "Add Expense" shortcut, and assign it a **keyboard shortcut** (Shortcut Details → Add Keyboard Shortcut).

---

## Security notes

- Your API token is like a password. If a device is lost, go to **Settings → API tokens** and **Revoke** it — then generate a new one.
- Use a separate token per device (label them) so you can revoke one without breaking the others.
