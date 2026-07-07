# ReadIt2Me — setup & deploy

Photograph book pages → clean transcript → emotionally narrated audio, at
`www.asmit.space/readit2me`. Static PWA + Firebase (`nyclistings-6d00e`) + one
Cloud Function.

| Piece | Where | What it does |
|---|---|---|
| App | `/readit2me/` | Capture, OCR (Gemini via Firebase AI Logic, client-side), library, player, PWA |
| TTS proxy | `functions/index.js` → `generateAudio` | Gemini 2.5 Flash TTS → MP3 → Cloud Storage. Only server piece. |
| Rules | `firestore.rules`, `storage.rules` | Owner-only `/users/{uid}/**`; usage counters admin-only |

## One-time Firebase console setup

All in [console.firebase.google.com/project/nyclistings-6d00e](https://console.firebase.google.com/project/nyclistings-6d00e):

1. **Upgrade to Blaze** (Storage + Functions require it) and set a **budget
   alert at $5** in Google Cloud Billing. Expected real cost: ~$0.03 per
   narrated page (once, then cached forever), ~$0.002 per OCR'd page.
2. **Build → AI Logic**: enable, choose **Gemini Developer API** provider.
3. **App Check**: register the web app with **reCAPTCHA v3**, copy the site
   key into `APPCHECK_SITE_KEY` in `readit2me/js/firebase.js`. Then enforce
   App Check for **AI Logic** and **Cloud Functions**.
   For local dev, add a debug token (App Check → Apps → ⋮ → Manage debug tokens;
   the app prints one in the console on localhost).
4. **Authentication → Sign-in method**: enable **Google** (Anonymous is
   already on). Add `www.asmit.space` and `asmit.space` under
   **Settings → Authorized domains**.
5. **Storage**: create the default bucket if it doesn't exist yet.
6. **Firestore rules**: merge the blocks from `firestore.rules` into the
   existing published rules (keep the `listings` — and, if deployed, the
   `pageviews` — blocks). Or deploy via CLI (below) after copying the existing
   console blocks into the file.

## Deploy the function + rules (CLI)

```bash
npm install -g firebase-tools        # once
firebase login                       # once
cd <repo root>
firebase use nyclistings-6d00e       # once
firebase functions:secrets:set GEMINI_API_KEY   # paste a key from aistudio.google.com
cd functions && npm install && cd ..
firebase deploy --only functions,storage
```

**Firestore rules: publish via the console, not the CLI.** `firestore.rules` in
this repo contains ONLY the readit2me blocks; the live project also has
`listings` (and maybe `pageviews`) rules that exist only in the console.
Running `firebase deploy --only firestore:rules` would replace the whole
ruleset and break the other apps. Paste the blocks from `firestore.rules` into
**Firestore → Rules** alongside the existing ones instead (or first copy the
console rules into the file, then CLI-deploy).

## Deploy the app

Upload the `readit2me/` folder to Hostinger like the rest of the site. That's
it — everything else is client-side.

## How state works

- First visit signs the user in **anonymously** — zero friction, full library.
- After their first book, a nudge offers **Link Google** so the library
  survives browser-data loss and follows them across devices (same UID, no
  migration; if the Google account already owns a user, data is merged).
- Firestore holds books, page transcripts, settings and a throttled
  per-book playback position (`users/{uid}/progress/{bookId}`) — resume works
  across devices via last-write-wins.
- Narrated MP3s live in Cloud Storage (generated once per page) and are cached
  per-device in IndexedDB, so repeat listens are free and offline playback works.

## Costs & limits

- `generateAudio` enforces **120 narrated pages/user/day** (`usage/{uid}`) plus
  a **1,000 pages/day project-wide circuit breaker** (`usage/_global`).
- OCR uses AI Logic's free-tier quota first; TTS is ~$0.03/page.
- OCR has no server-side meter — it's protected by App Check enforcement plus
  the AI Logic per-project quota. Set a conservative **requests-per-day quota
  on the Gemini API key / AI Logic** in the Google Cloud console so a stolen
  App Check token can't run up the vision bill.
- A 300-page book ≈ $9 one-time to narrate fully, ~300 MB of Storage (~$0.008/mo).

## Notes

- The Gemini TTS voice defaults to `Sulafat`; set `ttsVoice`/`styleHint` on a
  book doc to change narrator or emotional direction.
- `APPCHECK_SITE_KEY` empty = App Check in debug mode — the app **refuses to
  boot outside localhost** without a real key. Set it before the public deploy.
- Known limitation: when an anonymous library is merged into an existing Google
  account, the old anonymous UID's Firestore docs and Storage MP3s stay behind
  (unreachable, small). Enable auto-delete of stale anonymous accounts in
  Authentication settings, and sweep `users/` with admin tooling if it ever
  matters.
