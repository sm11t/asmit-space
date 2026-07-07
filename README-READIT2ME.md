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
# firestore rules: deploy only after merging existing console rules into firestore.rules
firebase deploy --only firestore:rules
```

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

- `generateAudio` enforces **120 narrated pages/user/day** (`usage/{uid}`).
- OCR uses AI Logic's free-tier quota first; TTS is ~$0.03/page.
- A 300-page book ≈ $9 one-time to narrate fully, ~300 MB of Storage (~$0.008/mo).

## Notes

- The Gemini TTS voice defaults to `Sulafat`; set `ttsVoice`/`styleHint` on a
  book doc to change narrator or emotional direction.
- `APPCHECK_SITE_KEY` empty = App Check disabled — acceptable only while
  developing locally. Set it before the public deploy.
