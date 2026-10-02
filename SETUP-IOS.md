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

This is a simple **4-action** shortcut — no lists, no menus, no Dictionary. You answer three prompts and it sends them.

Open the **Shortcuts** app → **+** to create a new shortcut. Search each action by name and add them **in this order**:

1. **Ask for Input**
   - Prompt: `Amount ₹`
   - Input Type: **Number**
2. **Ask for Input**
   - Prompt: `Category`
   - Input Type: **Text**  (you type it, e.g. `Food`. Keep spelling consistent so reports group nicely — any text is accepted.)
3. **Ask for Input**
   - Prompt: `Note (optional)`
   - Input Type: **Text**  (leave blank when you don't need a note.)
4. **Get Contents of URL**
   - URL: `https://<your-domain>/api/entries`
   - Tap the **⌄ Show More** arrow to reveal the rest.
   - **Method:** `POST`
   - **Headers → Add header:** Key `Authorization`, Value `Bearer <your-token>` (paste the token from Step 1)
   - **Request Body:** choose **JSON**, then **Add new field** four times:
     | Field    | Type   | Value |
     |----------|--------|-------|
     | `type`     | Text   | `expense` |
     | `amount`   | Number | tap value → **Select Variable** → the **1st** *Provided Input* (amount) |
     | `category` | Text   | tap value → **Select Variable** → the **2nd** *Provided Input* (category) |
     | `note`     | Text   | tap value → **Select Variable** → the **3rd** *Provided Input* (note) |
5. *(Optional but nice)* **Show Notification**
   - Text: `Saved ✓`

Name the shortcut **Add Expense** and tap **Done**.

> **The one thing to watch:** all three "Ask for Input" actions create a variable called **Provided Input**. When filling the JSON values, don't just tap the grey "Provided Input" chip above the keyboard (it inserts the *last* one) — tap the field, choose **Select Variable**, and pick the right one. They're listed in order: 1st = amount, 2nd = category, 3rd = note.
>
> You do **not** add a Content-Type header — picking **JSON** as the body sets it automatically.

**Test it:** run the shortcut from the Shortcuts app (tap ▶). Enter an amount like `120`, a category like `Food`, and a note. You should see "Saved ✓", and the entry should appear in the app's **History** tab. If nothing shows up: re-check the URL, that the header is exactly `Bearer <token>`, and that you picked the correct variable for each field.

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
