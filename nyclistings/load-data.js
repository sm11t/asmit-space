/* Listings loader.
 *
 * Reads `data/listings.json`. That's it — the map is open, there is no
 * password gate. (This file replaced gate.js, which fetched an AES-GCM blob
 * and prompted for a passphrase before decrypting.)
 *
 * Exports a single async function on window.NYCData:
 *   loadListings()  ->  resolves with the parsed listings.json payload.
 */
(() => {
  'use strict';

  const DATA_URL = 'data/listings.json';

  async function loadListings() {
    let res;
    try {
      res = await fetch(DATA_URL, { cache: 'no-cache' });
    } catch (err) {
      throw new Error(`could not reach ${DATA_URL} (${err.message})`);
    }
    if (!res.ok) throw new Error(`${DATA_URL} returned HTTP ${res.status}`);
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`${DATA_URL} is not valid JSON (${err.message})`);
    }
  }

  window.NYCData = { loadListings };

  // Clear the old gate's cached decryption key so no stale secret lingers in
  // localStorage on devices that used the password build. Safe to delete this
  // line once everyone has loaded the page at least once.
  try { localStorage.removeItem('nyc-listings:gate-key:v1'); } catch { /* ignore */ }
})();
