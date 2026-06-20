---
description: Scaffold JigsawIt in the CURRENT folder — install dependencies, clean boilerplate, verify the dev server runs. Run this FIRST before anything else.
---

# /setup — JigsawIt Project Scaffolder 🧩

You are already inside the project root folder. This is your working directory.
Do NOT create a subfolder. Do NOT cd anywhere. Work RIGHT HERE.

Execute the following steps IN ORDER, sequentially — NOT in parallel.
Confirm each step succeeded before moving to the next.
If any step fails, STOP and report the exact error — do not improvise.

---

## Step 1 — Scaffold Vite + React IN THE CURRENT FOLDER

### ⛔ FORBIDDEN COMMANDS — Do not run these under ANY circumstances:
- `npm create vite@latest jigsawit` — creates a jigsawit/ subfolder. FORBIDDEN.
- `npx create-vite@latest . --overwrite` — NUKES THE ENTIRE DIRECTORY including config files. ABSOLUTELY FORBIDDEN. This will delete GEMINI.md and make the user very sad and angry.
- `npx create-vite@latest . --force` — same as above. FORBIDDEN.
- Any command with `--overwrite` or `--force` flags. FORBIDDEN. Full stop.

### ✅ Strategy A (try this first):
```bash
npx create-vite@latest . --template react --no-interactive
```

If this succeeds (exit code 0, `package.json` now exists in current dir) → move to Step 2.

If this fails with ANY error about "directory not empty", "existing files",
or similar → DO NOT attempt to fix it. DO NOT try flags. Go DIRECTLY to Strategy B.

### ✅ Strategy B (only if Strategy A failed):

Scaffold into a temp folder OUTSIDE the current project, then move files in:

```bash
# 1. Go UP one level to the parent folder
cd ..

# 2. Scaffold into a temp folder sitting NEXT TO your project (not inside it)
npx create-vite@latest tmp_vite_scaffold --template react --no-interactive

# 3. Move only the scaffolded files into your project root (not the folder itself)
cp -r tmp_vite_scaffold/src ../ImageJigsawApp/src || true
cp tmp_vite_scaffold/index.html ../ImageJigsawApp/index.html
cp tmp_vite_scaffold/package.json ../ImageJigsawApp/package.json
cp tmp_vite_scaffold/vite.config.js ../ImageJigsawApp/vite.config.js
cp tmp_vite_scaffold/eslint.config.js ../ImageJigsawApp/eslint.config.js || true

# 4. Clean up the temp folder
rm -rf tmp_vite_scaffold

# 5. Go back into your project
cd ImageJigsawApp
```

After Strategy B: confirm `package.json` exists in the project root. 
Your GEMINI.md and .agents/ folder should be completely untouched.
If they are gone — STOP and tell the user immediately.

---

## Step 2 — Install Dependencies

```bash
npm install
```

Wait for the install to complete.
Confirm `node_modules/` exists in the current directory.
If there are peer dependency warnings, note them but continue.
If there are hard errors, stop and report them.

---

## Step 3 — Create the Source Folder Structure

```bash
mkdir -p src/puzzle src/components
```

Confirm both folders were created successfully inside `src/`.

---

## Step 4 — Clear the Vite Boilerplate

Replace the contents of `src/App.jsx` with a clean placeholder:

```jsx
function App() {
  return <div>JigsawIt is loading...</div>
}

export default App
```

Clear `src/App.css` — delete ALL its contents. Empty file, keep it.
Clear `src/index.css` — delete ALL its contents. Empty file, keep it.

Confirm all three files are updated.

---

## Step 5 — Verify GEMINI.md Is Still Alive

Check that `GEMINI.md` exists in the current directory (project root).

If it is missing, STOP immediately and tell the user:
> "🚨 GEMINI.md has gone missing — it may have been deleted during scaffolding.
> Please restore it from your downloads and run /setup again.
> I am deeply sorry. This was my fault."

Do NOT attempt to reconstruct or rewrite GEMINI.md from memory.
Do NOT proceed until it is confirmed present.

---

## Step 6 — Fix Vite Config for Vercel

Open `vite.config.js` and ensure it contains `base: './'`.
Rewrite it to exactly this:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
})
```

Confirm the file is saved.

---

## Step 7 — Start the Dev Server and Verify

```bash
npm run dev
```

Confirm the dev server starts and reports a local URL (typically http://localhost:5173).
Tell the user:

> "✅ Phase 0 complete! Your dev server is running at http://localhost:5173
> Open it in your browser — you should see 'JigsawIt is loading...'
>
> Your folder structure looks like this:
>
> (project root)/
> ├── GEMINI.md              ✅ (survived the scaffolding!)
> ├── package.json           ✅
> ├── vite.config.js         (base: './' confirmed ✅)
> ├── src/
> │   ├── App.jsx            (placeholder set ✅)
> │   ├── App.css            (empty ✅)
> │   ├── index.css          (empty ✅)
> │   ├── puzzle/            (ready for generator.js + usePuzzleGame.js)
> │   └── components/        (ready for PuzzleApp.jsx)
> └── .agents/
>     ├── workflows/         (this file lives here — still alive! ✅)
>     ├── skills/
>     └── rules/
>
> You're ready for Phase 1. Go make yourself a kopi. ☕🚀"