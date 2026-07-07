/* Firebase bootstrap for ReadIt2Me.
 *
 * Loads the Firebase v12 modular SDK from gstatic (v12+ needed for firebase/ai,
 * the AI Logic client). Reuses the nyclistings-6d00e project — data is isolated
 * under /users/{uid}/** by the security rules.
 *
 * NOTE: the config is not a secret; it only identifies the project. Abuse is
 * prevented by App Check + security rules + the callable function's own checks.
 */

const SDK = 'https://www.gstatic.com/firebasejs/12.0.0';

const CONFIG = {
  apiKey:            'AIzaSyCu8Mnxg5t7Ge1R1zvhDuLCN4JMQUkRxmM',
  authDomain:        'nyclistings-6d00e.firebaseapp.com',
  projectId:         'nyclistings-6d00e',
  storageBucket:     'nyclistings-6d00e.firebasestorage.app',
  messagingSenderId: '25702160596',
  appId:             '1:25702160596:web:92f8e09655f130b4e98341',
};

// From Firebase console → App Check → Web (reCAPTCHA v3). Empty = App Check off
// (fine for local dev with the debug token; REQUIRED before real deploy).
const APPCHECK_SITE_KEY = '';

const appMod       = await import(`${SDK}/firebase-app.js`);
const authMod      = await import(`${SDK}/firebase-auth.js`);
const firestoreMod = await import(`${SDK}/firebase-firestore.js`);
const storageMod   = await import(`${SDK}/firebase-storage.js`);
const functionsMod = await import(`${SDK}/firebase-functions.js`);

export const app = appMod.initializeApp(CONFIG, 'readit2me');

// App Check must be initialized before any other service makes a request.
// On localhost without a site key, the SDK's debug provider takes over (the
// debug flag must be set BEFORE initializeAppCheck; the token it prints in
// the console gets registered in Firebase console → App Check → debug tokens).
// A production deploy without a key fails LOUDLY rather than running with the
// Gemini quota unprotected.
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (!APPCHECK_SITE_KEY && !isLocal) {
  throw new Error(
    '[readit2me] APPCHECK_SITE_KEY is not set — refusing to run unprotected ' +
    'outside localhost. See README-READIT2ME.md step 3.',
  );
}
{
  const appCheckMod = await import(`${SDK}/firebase-app-check.js`);
  if (!APPCHECK_SITE_KEY) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  appCheckMod.initializeAppCheck(app, {
    provider: new appCheckMod.ReCaptchaV3Provider(APPCHECK_SITE_KEY || 'debug-placeholder'),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = authMod.getAuth(app);

// Offline-first Firestore: queues writes (e.g. playback progress) while offline
// and replays them on reconnect.
export const db = firestoreMod.initializeFirestore(app, {
  localCache: firestoreMod.persistentLocalCache(),
});

export const storage = storageMod.getStorage(app);
export const functions = functionsMod.getFunctions(app);

// Re-export the SDK pieces the rest of the app needs, so every other module
// imports from './firebase.js' and the SDK version lives in exactly one place.
export const fs = firestoreMod;   // doc, collection, setDoc, onSnapshot, ...
export const st = storageMod;     // ref, getBlob, getDownloadURL, ...
export const fn = functionsMod;   // httpsCallable
export const au = authMod;        // GoogleAuthProvider, linkWithPopup, ...

/* ── Auth: anonymous-first, link to Google later ─────────────────────────── */

let resolveUser;
export const userReady = new Promise((res) => { resolveUser = res; });

authMod.onAuthStateChanged(auth, (user) => {
  if (user) {
    resolveUser(user);
  } else {
    authMod.signInAnonymously(auth).catch((err) => {
      console.error('[auth] anonymous sign-in failed', err);
    });
  }
});

export function currentUser() {
  return auth.currentUser;
}

export function isLinked() {
  const u = auth.currentUser;
  return !!u && !u.isAnonymous;
}

/* Link the anonymous account to Google. Keeps the same UID (no data migration).
 * On `credential-already-in-use` (the Google account already owns another
 * Firebase user) we merge instead: `takeSnapshot()` is awaited while we are
 * STILL the anonymous user (rules forbid cross-uid reads, so this is the only
 * moment the data is readable), and only then do we switch to the existing
 * account. The caller restores the snapshot afterwards.
 * Returns { merged: boolean }. */
export async function linkGoogle(takeSnapshot) {
  const provider = new authMod.GoogleAuthProvider();
  try {
    await authMod.linkWithPopup(auth.currentUser, provider);
    return { merged: false };
  } catch (err) {
    if (err.code !== 'auth/credential-already-in-use') throw err;
    const cred = authMod.GoogleAuthProvider.credentialFromError(err);
    if (typeof takeSnapshot === 'function') {
      await takeSnapshot(); // MUST complete before the auth switch below
    }
    await authMod.signInWithCredential(auth, cred);
    return { merged: true };
  }
}
