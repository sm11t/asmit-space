/* NYC Listings — map + interactions
 *
 * Vanilla JS, Leaflet, OpenStreetMap. Notes & status sync through Firebase
 * (window.NYCFirebase) when configured; otherwise fall back to per-browser
 * localStorage so the page stays useful in dev / on a fork without config.
 */
(() => {
  'use strict';

  // ---------- constants ----------
  const STORAGE_NOTES   = 'nyc-listings:notes:v2';
  const STORAGE_STATUS  = 'nyc-listings:status:v1';
  const STORAGE_AUTHOR  = 'nyc-listings:author:v1';
  const STATUS_OPTIONS  = ['interested', 'contacted', 'scheduled', 'visited', 'rejected'];
  // Who can post notes. Picking a name is how you identify yourself — there are
  // no accounts and no password, so this is an honour-system byline.
  const PEOPLE = ['Jay', 'Viktor', 'Zeyad', 'Asmit'];
  const STORAGE_NOTES_OPEN = 'nyc-listings:notes-open:v1';
  const BBOX = { sw: [40.55, -74.12], ne: [40.92, -73.78] };

  const SUBWAY_COLORS = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C', '6X': '#00933C',
    '7': '#B933AD', '7X': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319', 'FX': '#FF6319',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'S': '#808183', 'SI': '#808183', 'SIR': '#808183',
  };
  const TRUNK_LEGEND = [
    { letters: '1 2 3', color: SUBWAY_COLORS['1'] },
    { letters: '4 5 6', color: SUBWAY_COLORS['4'] },
    { letters: '7',     color: SUBWAY_COLORS['7'] },
    { letters: 'A C E', color: SUBWAY_COLORS['A'] },
    { letters: 'B D F M', color: SUBWAY_COLORS['B'] },
    { letters: 'N Q R W', color: SUBWAY_COLORS['N'], yellow: true },
    { letters: 'G',     color: SUBWAY_COLORS['G'] },
    { letters: 'J Z',   color: SUBWAY_COLORS['J'] },
    { letters: 'L',     color: SUBWAY_COLORS['L'], gray: true },
  ];

  const el  = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    listings: [],
    filters: { search: '', minPrice: null, maxPrice: null, leases: new Set(), hoods: new Set(), dateAdded: '' },
    selectedId: null,
    author: PEOPLE.includes(localStorage.getItem(STORAGE_AUTHOR)) ? localStorage.getItem(STORAGE_AUTHOR) : '',
    notesByListing: {},   // { listingId: [{ id, text, author, uid, createdAt }] }
    noteCounts:    {},    // { listingId: count }  used for marker dot + sheet meta
    status:        {},    // { listingId: 'interested' | ... }
    currentNoteUnsub: null,
    markers: new Map(),
    map: null,
    panes: {},
    layers: { subway: null, stations: null, bus: null, labels: null },
    backend: 'local',     // 'local' | 'firebase'
  };

  // ---------- safe storage ----------
  function loadStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }
  function saveStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('storage failed', e); }
  }

  // ---------- listing classifiers ----------
  function priceTier(l) {
    const p = l.price_sort;
    if (!p) return 'mid';
    if (p <= 1150) return 'low';
    if (p <= 1350) return 'mid';
    return 'high';
  }
  function isSublet(l) {
    const t = (l.lease_term || '').toString().toLowerCase();
    const lt = (l.listing_type || '').toString().toLowerCase();
    return t.includes('sublet') || lt.includes('sublet');
  }
  function leaseBucket(l) {
    if (isSublet(l)) return 'sublet';
    const t = (l.lease_term || '').toString().toLowerCase();
    if (t.includes('11')) return '11mo';
    return 'standard';
  }
  // Listings in these collections are quoted as whole-unit rent (portal
  // listings), so that is the headline number — not the derived per-room price.
  // A listing can override either way with `price_display: total | room`.
  const TOTAL_PRICE_COLLECTIONS = new Set(['JAVZ']);

  function priceMode(l) {
    if (l.price_display === 'total' || l.price_display === 'room') return l.price_display;
    if (l.price_total && TOTAL_PRICE_COLLECTIONS.has(l.collection)) return 'total';
    return 'room';
  }
  // Short unit suffix for compact rows ("/mo" vs "/rm").
  function priceUnit(l) {
    return priceMode(l) === 'total' ? '/mo' : '/rm';
  }

  function fmtPrice(l) {
    if (priceMode(l) === 'total') return `$${l.price_total.toLocaleString()}`;
    if (l.price_per_bedroom) return `$${l.price_per_bedroom.toLocaleString()}`;
    if (l.price_per_bedroom_low && l.price_per_bedroom_high)
      return `$${l.price_per_bedroom_low.toLocaleString()}–$${l.price_per_bedroom_high.toLocaleString()}`;
    return '—';
  }

  // Capture date ("date I saved this") is the YYYY-MM-DD prefix on the id.
  function captureDate(l) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(l.id || '');
    return m ? m[1] : null;
  }

  // A listing belongs to a named collection (frontmatter `collection: JAVZ`)
  // if it has one, otherwise it falls back to its capture date. Named
  // collections are curated lists — viewings — and outrank the date batches.
  function groupKey(l) {
    return l.collection ? `c:${l.collection}` : (captureDate(l) ? `d:${captureDate(l)}` : null);
  }
  function groupLabel(key) {
    return key.startsWith('c:') ? key.slice(2) : fmtCaptureDate(key.slice(2));
  }
  function fmtCaptureDate(iso) {
    const [y, mo, d] = iso.split('-').map(Number);
    // Local-time constructor avoids the UTC-parse day shift of new Date(iso).
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---------- bootstrap ----------
  async function init() {
    let payload;
    try {
      payload = await window.NYCData.loadListings();
    } catch (err) {
      showFatal(`Could not load listings — ${err.message}. ` +
        `If you opened this file directly, serve the folder over HTTP instead (e.g. python -m http.server inside the web/ folder).`);
      return;
    }

    state.listings = payload.listings || [];
    el('#count-pill').textContent = `${state.listings.length} listings`;

    setupMap();
    setupPanes();
    await loadTransitLayers();
    setupTransitToggles();
    renderSubwayLegend();
    await loadLandmarks();

    await initBackend();
    setupAuthorInput();

    renderMarkers();
    renderQuickList();
    setupFilters();
    setupPresets();
    setupSearch();
    setupChrome();
    bindKeyboard();
  }

  function showFatal(msg) {
    const map = el('#map');
    map.innerHTML = `<div style="padding:2rem;color:var(--text-mute);max-width:42ch;line-height:1.5">${msg}</div>`;
  }

  // ---------- backend: Firebase if available, otherwise local ----------
  function initBackend() {
    return new Promise((resolve) => {
      const start = (fb) => {
        if (fb && fb.enabled) {
          fb.ready.then((ok) => {
            if (ok) {
              state.backend = 'firebase';
              setSyncPill('synced', 'Notes synced via Firebase');
              fb.onAllStatus((map) => {
                state.status = map || {};
                if (state.selectedId) refreshStatusChips();
              });
              fb.onAllNoteCounts((counts) => {
                state.noteCounts = counts || {};
                refreshAllMarkerDots();
                if (state.selectedId) updateSheetSummary();
              });
            } else {
              fallbackLocal();
            }
            resolve();
          });
        } else {
          fallbackLocal();
          resolve();
        }
      };

      function fallbackLocal() {
        state.backend = 'local';
        // Migrate v1 single-textarea notes if present.
        const legacy = loadStore('nyc-listings:notes:v1');
        const v2 = loadStore(STORAGE_NOTES);
        if (Object.keys(legacy).length && !Object.keys(v2).length) {
          const migrated = {};
          for (const [id, text] of Object.entries(legacy)) {
            if (typeof text === 'string' && text.trim()) {
              migrated[id] = [{
                id: 'legacy',
                text,
                author: state.author,
                createdAt: Date.now(),
                uid: 'local',
              }];
            }
          }
          saveStore(STORAGE_NOTES, migrated);
        }
        state.notesByListing = loadStore(STORAGE_NOTES);
        state.noteCounts = Object.fromEntries(
          Object.entries(state.notesByListing).map(([k, v]) => [k, (v || []).length])
        );
        state.status = loadStore(STORAGE_STATUS);
        setSyncPill('local', 'Notes are stored only in this browser');
      }

      if (window.NYCFirebase !== undefined) {
        start(window.NYCFirebase);
      } else {
        window.addEventListener('nyc-firebase-ready', () => start(window.NYCFirebase), { once: true });
        // safety timeout in case the script never loads
        setTimeout(() => {
          if (state.backend === 'local' && !window.NYCFirebase) fallbackLocal();
          resolve();
        }, 3500);
      }
    });
  }

  function setSyncPill(kind, title) {
    const p = el('#sync-pill');
    if (!p) return;
    p.classList.remove('is-live', 'is-local');
    if (kind === 'synced') {
      p.classList.add('is-live');
      p.textContent = 'live';
      p.title = title;
    } else {
      p.classList.add('is-local');
      p.textContent = 'local';
      p.title = title;
    }
  }

  // ---------- map ----------
  function setupMap() {
    const map = L.map('map', {
      zoomControl: false, // re-added below in bottom-right so it doesn't
                          // overlap the Filters FAB on mobile
      preferCanvas: false,
      maxBounds: L.latLngBounds(BBOX.sw, BBOX.ne).pad(0.4),
      maxBoundsViscosity: 0.7,
      minZoom: 11,
      maxZoom: 18,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO · subway/bus shapes © MTA',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    map.fitBounds(L.latLngBounds(BBOX.sw, BBOX.ne), { padding: [20, 20] });
    state.map = map;
  }

  function setupPanes() {
    const m = state.map;
    state.panes.bus      = m.createPane('busPane');     state.panes.bus.style.zIndex      = 380;
    state.panes.subway   = m.createPane('subwayPane');  state.panes.subway.style.zIndex   = 410;
    state.panes.stations = m.createPane('stationPane'); state.panes.stations.style.zIndex = 440;
    state.panes.labels   = m.createPane('labelPane');   state.panes.labels.style.zIndex   = 460;
    state.panes.labels.style.pointerEvents = 'none';
    state.panes.landmark = m.createPane('landmarkPane'); state.panes.landmark.style.zIndex = 480;
  }

  async function loadLandmarks() {
    if (!state.map) return;
    let payload;
    try {
      const r = await fetch('data/landmarks.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      payload = await r.json();
    } catch (err) {
      console.warn('landmarks.json failed to load', err);
      return;
    }
    const list = Array.isArray(payload?.landmarks) ? payload.landmarks : [];
    list.forEach(addLandmarkMarker);
  }

  function addLandmarkMarker(lm) {
    if (lm.lat == null || lm.lng == null) return;
    const html = landmarkIconHtml(lm.kind || 'star', lm.name || '');
    const icon = L.divIcon({
      className: 'landmark-icon',
      html,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -12],
    });
    const marker = L.marker([lm.lat, lm.lng], {
      icon,
      pane: 'landmarkPane',
      keyboard: false,
      title: lm.name || '',
    }).addTo(state.map);
    const subtitle = [lm.subtitle, lm.address].filter(Boolean).map(escape).join(' · ');
    marker.bindPopup(
      `<p class="pop-title">${escape(lm.name || '')}</p>` +
      (subtitle ? `<p class="pop-meta">${subtitle}</p>` : ''),
      { closeButton: false, offset: L.point(0, -4) }
    );
  }

  function landmarkIconHtml(kind, label) {
    if (kind === 'star') {
      return (
        `<svg class="landmark-star" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" aria-label="${escape(label)}">` +
        '<path d="M12 2 L14.6 8.6 L21.8 9.27 L16.3 14.14 L17.95 21 L12 17.27 L6.05 21 L7.7 14.14 L2.2 9.27 L9.4 8.6 Z" ' +
        'fill="#ffffff" stroke="#000" stroke-width="0.8" stroke-linejoin="round"/>' +
        '</svg>'
      );
    }
    return `<div class="landmark-dot" title="${escape(label)}"></div>`;
  }

  async function loadTransitLayers() {
    const fetchJson = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    };
    const [lines, stations, buses] = await Promise.all([
      fetchJson('data/transit/subway-lines.min.geojson').catch(() => null),
      fetchJson('data/transit/subway-stations.min.geojson').catch(() => null),
      fetchJson('data/transit/bus-routes.min.geojson').catch(() => null),
    ]);

    if (lines) {
      state.layers.subway = L.geoJSON(lines, {
        pane: 'subwayPane',
        style: (f) => {
          const raw = (f.properties.service || '').toUpperCase().trim();
          const key = raw.startsWith('S') ? 'S' : raw.split(/\s+/)[0];
          return { color: SUBWAY_COLORS[key] || '#888', weight: 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round' };
        },
        onEachFeature: (f, layer) => {
          const svc = f.properties.service || '?';
          layer.bindPopup(
            `<p class="pop-title">${escape(svc)} train</p>` +
            `<p class="pop-meta">${escape(f.properties.service_name || '')}</p>`,
            { closeButton: false, offset: L.point(0, -2) }
          );
        },
      }).addTo(state.map);
    }

    if (stations) {
      state.layers.stations = L.geoJSON(stations, {
        pane: 'stationPane',
        pointToLayer: (f, latlng) => {
          const isComplex = Number(f.properties.complex_id) > 0;
          return L.marker(latlng, {
            pane: 'stationPane',
            icon: L.divIcon({
              className: '',
              html: `<div class="station-marker${isComplex ? ' is-complex' : ''}"></div>`,
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
            keyboard: false,
          });
        },
        onEachFeature: (f, layer) => {
          const p = f.properties;
          layer.bindPopup(
            `<p class="pop-title">${escape(p.stop_name || '')}</p>` +
            `<p class="pop-meta">${escape(p.daytime_routes || '—')} · ${escape(p.line || '')} · ${escape(p.borough || '')}</p>`,
            { closeButton: false, offset: L.point(0, -6) }
          );
        },
      }).addTo(state.map);
    }

    if (buses) {
      state.layers.bus = L.geoJSON(buses, {
        pane: 'busPane',
        style: (f) => ({
          color: '#' + (f.properties.route_color || '888888'),
          weight: 1.4, opacity: 0.55, lineCap: 'round', lineJoin: 'round',
        }),
        onEachFeature: (f, layer) => {
          const p = f.properties;
          layer.bindPopup(
            `<p class="pop-title">${escape(p.route_short_name || '?')}</p>` +
            `<p class="pop-meta">${escape(p.route_long_name || '')}</p>`,
            { closeButton: false }
          );
        },
      });
    }

    state.layers.labels = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 19, pane: 'labelPane' }
    );
  }

  function setupTransitToggles() {
    bindToggle('#t-subway',   state.layers.subway,   true);
    bindToggle('#t-stations', state.layers.stations, true);
    bindToggle('#t-bus',      state.layers.bus,      false);
    bindToggle('#t-labels',   state.layers.labels,   false);
  }

  function bindToggle(sel, layer, defaultOn) {
    const cb = el(sel);
    if (!cb || !layer) { if (cb) cb.disabled = true; return; }
    cb.checked = defaultOn;
    if (defaultOn && !state.map.hasLayer(layer)) layer.addTo(state.map);
    if (!defaultOn && state.map.hasLayer(layer)) state.map.removeLayer(layer);
    cb.addEventListener('change', () => {
      if (cb.checked) layer.addTo(state.map);
      else state.map.removeLayer(layer);
    });
  }

  function renderSubwayLegend() {
    const ul = el('#subway-legend');
    if (!ul) return;
    ul.innerHTML = '';
    TRUNK_LEGEND.forEach(({ letters, color, yellow, gray }) => {
      const li = document.createElement('li');
      const cls = 'subway-bullet' + (yellow ? ' is-yellow' : '') + (gray ? ' is-gray' : '');
      li.innerHTML = `<span class="${cls}" style="background:${color}" title="${letters}">${letters.split(' ')[0]}</span>`;
      ul.appendChild(li);
    });
  }

  // ---------- markers ----------
  function buildIcon(l, opts = {}) {
    const tier = priceTier(l);
    const sublet = isSublet(l);
    const noted = (state.noteCounts[l.id] || 0) > 0;
    return L.divIcon({
      className: '',
      html: `<div class="marker${opts.selected ? ' is-selected' : ''}"
                  data-tier="${tier}"
                  data-sublet="${sublet}"
                  data-noted="${noted}"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -10],
    });
  }

  function renderMarkers() {
    state.markers.forEach((m) => state.map.removeLayer(m));
    state.markers.clear();

    const visible = filteredListings();
    visible.forEach((l) => {
      if (l.lat == null || l.lng == null) return;
      const marker = L.marker([l.lat, l.lng], { icon: buildIcon(l) }).addTo(state.map);
      marker.bindPopup(popupHtml(l), { closeButton: false, offset: L.point(0, -6) });
      marker.on('click', () => {
        marker.closePopup();
        selectListing(l.id, { fly: false, openSheet: true });
      });
      state.markers.set(l.id, marker);
    });

    el('#count-pill').textContent = `${visible.length} of ${state.listings.length}`;
    refreshSelectedMarker();
  }

  function popupHtml(l) {
    const subl = isSublet(l) ? ' · sublet' : '';
    return `
      <p class="pop-title">${escape(l.address || l.title)}</p>
      <p class="pop-meta">${fmtPrice(l)}${priceUnit(l)} · ${escape(l.neighborhood || '—')}${subl}</p>
    `;
  }

  function refreshSelectedMarker() {
    state.markers.forEach((m, id) => {
      const l = state.listings.find((x) => x.id === id);
      if (!l) return;
      m.setIcon(buildIcon(l, { selected: id === state.selectedId }));
    });
  }

  function refreshAllMarkerDots() {
    refreshSelectedMarker(); // same icon-rebuild path; uses fresh noteCounts
  }

  // ---------- filters / search ----------
  function setupFilters() {
    const leaseGroups = ['standard', '11mo', 'sublet'];
    const leaseBox = el('#lease-chips');
    leaseGroups.forEach((b) => {
      const count = state.listings.filter((l) => leaseBucket(l) === b).length;
      const c = makeChip(b, count, () => toggleSet(state.filters.leases, b));
      c.dataset.lease = b;
      leaseBox.appendChild(c);
    });

    const hoodCounts = countBy(state.listings, (l) => l.neighborhood || '—');
    const hoodBox = el('#hood-chips');
    Object.entries(hoodCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([h, n]) => {
        const c = makeChip(h, n, () => toggleSet(state.filters.hoods, h));
        c.dataset.hood = h;
        hoodBox.appendChild(c);
      });

    el('#price-min').addEventListener('input', (e) => {
      state.filters.minPrice = e.target.value ? Number(e.target.value) : null;
      renderMarkers(); renderQuickList();
    });
    el('#price-max').addEventListener('input', (e) => {
      state.filters.maxPrice = e.target.value ? Number(e.target.value) : null;
      renderMarkers(); renderQuickList();
    });
    el('#reset').addEventListener('click', resetFilters);
  }

  // Preset dropdown (topbar): filter by the date a listing was saved.
  function setupPresets() {
    const sel = el('#preset-select');
    if (!sel) return;

    const counts = countBy(state.listings.filter(groupKey), groupKey);
    const keys = Object.keys(counts);
    // Named collections first (newest-added on top), then date batches newest-first.
    const named = keys.filter((k) => k.startsWith('c:')).sort();
    const dates = keys.filter((k) => k.startsWith('d:')).sort().reverse();

    sel.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = `All listings · ${state.listings.length}`;
    sel.appendChild(all);

    const addGroup = (label, list) => {
      if (!list.length) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      list.forEach((k) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = `${groupLabel(k)} · ${counts[k]}`;
        grp.appendChild(o);
      });
      sel.appendChild(grp);
    };
    addGroup('Lists', named);
    addGroup('Saved on', dates);

    sel.value = state.filters.dateAdded || '';
    sel.classList.toggle('is-active', !!sel.value);
    sel.addEventListener('change', () => {
      state.filters.dateAdded = sel.value;
      sel.classList.toggle('is-active', !!sel.value);
      renderMarkers();
      renderQuickList();
      if (sel.value) fitToVisible();
    });
  }

  function fitToVisible() {
    if (!state.map) return;
    const pts = filteredListings()
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => [l.lat, l.lng]);
    if (pts.length) {
      state.map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    }
  }

  function setupSearch() {
    el('#search').addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim().toLowerCase();
      renderMarkers(); renderQuickList();
    });
  }

  function toggleSet(set, value) {
    if (set.has(value)) set.delete(value); else set.add(value);
    renderMarkers(); renderQuickList(); refreshChipStates();
  }

  function refreshChipStates() {
    els('#lease-chips .chip').forEach((c) => {
      c.classList.toggle('active', state.filters.leases.has(c.dataset.lease));
    });
    els('#hood-chips .chip').forEach((c) => {
      c.classList.toggle('active', state.filters.hoods.has(c.dataset.hood));
    });
  }

  function resetFilters() {
    state.filters = { search: '', minPrice: null, maxPrice: null, leases: new Set(), hoods: new Set(), dateAdded: '' };
    el('#search').value = '';
    el('#price-min').value = '';
    el('#price-max').value = '';
    const ps = el('#preset-select');
    if (ps) { ps.value = ''; ps.classList.remove('is-active'); }
    refreshChipStates();
    renderMarkers(); renderQuickList();
  }

  function filteredListings() {
    const { search, minPrice, maxPrice, leases, hoods, dateAdded } = state.filters;
    return state.listings.filter((l) => {
      if (dateAdded && groupKey(l) !== dateAdded) return false;
      if (search) {
        const hay = [l.title, l.address, l.neighborhood, l.operator, l.contact_phone, l.listing_type, l.lease_term]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (minPrice != null && (l.price_sort == null || l.price_sort < minPrice)) return false;
      if (maxPrice != null && (l.price_sort == null || l.price_sort > maxPrice)) return false;
      if (leases.size && !leases.has(leaseBucket(l))) return false;
      if (hoods.size && !hoods.has(l.neighborhood || '—')) return false;
      return true;
    });
  }

  function makeChip(label, count, onClick) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.innerHTML = `${escape(label)}<span class="chip-count">${count}</span>`;
    c.addEventListener('click', onClick);
    return c;
  }

  function countBy(list, fn) {
    return list.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  }

  // ---------- quick list ----------
  function renderQuickList() {
    const ul = el('#quick-list');
    if (!ul) return;
    ul.innerHTML = '';
    const visible = filteredListings()
      .slice()
      .sort((a, b) => (a.miles_to_nyu ?? 99) - (b.miles_to_nyu ?? 99));
    visible.forEach((l) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="qa-head">${escape(l.address || l.title)}</span>
        <span class="qa-meta">${fmtPrice(l)}${
          priceMode(l) === 'room' && l.price_total && l.beds_in_unit > 1
            ? `<span class="qa-whole"> ($${l.price_total.toLocaleString()} unit)</span>` : ''
        } · ${l.miles_to_nyu ?? '—'}mi</span>
      `;
      li.addEventListener('click', () => selectListing(l.id, { fly: true, openSheet: true }));
      ul.appendChild(li);
    });
  }

  // ---------- detail panel ----------
  function selectListing(id, opts = {}) {
    state.selectedId = id;
    const l = state.listings.find((x) => x.id === id);
    if (!l) return;

    if (opts.fly && l.lat != null) {
      state.map.flyTo([l.lat, l.lng], Math.max(state.map.getZoom(), 15), { duration: 0.6 });
    }
    refreshSelectedMarker();
    renderDetail(l);
    closeDrawer();
    if (opts.openSheet) openSheet();
    updateSheetSummary();
  }

  function renderDetail(l) {
    state.exitNotesFullscreen?.();
    state.exitNotesFullscreen = null;
    const root = el('#detail-scroll');
    const tpl = el('#detail-template').content.cloneNode(true);
    const card = tpl.querySelector('.detail-card');

    bindText(card, 'neighborhood', l.neighborhood || '—');
    bindText(card, 'title', l.title || l.address);
    bindText(card, 'address', l.address || '');

    renderGallery(card, l);

    // Grid
    const grid = card.querySelector('.detail-grid');
    grid.appendChild(field(priceMode(l) === 'total' ? 'Rent / month' : 'Price / room',
                          priceCell(l), { className: 'span-2' }));
    grid.appendChild(field('Beds / Baths', `${l.beds_in_unit ?? '—'} / ${l.baths ?? '—'}`));
    grid.appendChild(field('Sq ft', l.sqft ? `${l.sqft}` : '—'));
    grid.appendChild(field('Distance to NYU', l.miles_to_nyu != null ? `${l.miles_to_nyu} mi` : '—'));
    grid.appendChild(field('Availability', l.availability || l.availability_start || l.move_in_listed || '—'));
    grid.appendChild(field('Lease', l.lease_term || (isSublet(l) ? 'sublet' : 'standard')));
    grid.appendChild(field('Contact', formatContact(l), { mono: true }));
    grid.appendChild(field('Operator', l.operator || (l.listing_type || '—')));
    grid.appendChild(field('Coords', `${l.lat?.toFixed(4)}, ${l.lng?.toFixed(4)}`, { mono: true }));
    grid.appendChild(field('Last updated', l.last_updated || '—', { mono: true, className: 'span-2' }));

    if (Array.isArray(l.rooms) && l.rooms.length) {
      const sec = card.querySelector('.detail-rooms');
      sec.hidden = false;
      sec.querySelector('[data-slot="rooms-table"]').innerHTML = roomsTable(l.rooms);
    }

    if (Array.isArray(l.amenities) && l.amenities.length) {
      const sec = card.querySelector('.detail-amenities');
      sec.hidden = false;
      const ul = sec.querySelector('[data-slot="amenities"]');
      l.amenities.forEach((a) => {
        const li = document.createElement('li');
        li.textContent = a;
        ul.appendChild(li);
      });
    }

    // ----- notes thread -----
    setupNotesSection(card, l);

    // ----- status chips -----
    renderStatusChips(card, l);

    // body summary
    const summarySlot = card.querySelector('[data-slot="summary"]');
    summarySlot.innerHTML = mdToHtml(l.body_md || '');

    // source link
    const a = card.querySelector('[data-slot="source-link"]');
    a.href = '../' + (l.source_file || '');

    root.innerHTML = '';
    root.appendChild(card);
    // Must run once the card is in the document — refreshIdentityUI() queries
    // document-wide, so a detached fragment would be invisible to it.
    refreshIdentityUI();
    root.scrollTop = 0;
  }

  // ---------- photo gallery ----------

  // Local copies (downloaded at parse time) are authoritative; the remote CDN
  // URLs are a fallback for listings saved before photos were pulled, and for
  // any file that failed to download.
  function photoSources(l) {
    const local = Array.isArray(l.photo_files) ? l.photo_files : [];
    const remote = Array.isArray(l.photo_urls) ? l.photo_urls : [];
    return local.length ? local.map((p, i) => ({ src: p, fallback: remote[i] || null }))
                        : remote.map((u) => ({ src: u, fallback: null }));
  }

  function renderGallery(card, l) {
    const shots = photoSources(l);
    const sec = card.querySelector('.detail-gallery');
    if (!sec || !shots.length) return;
    sec.hidden = false;
    const strip = sec.querySelector('[data-slot="gallery"]');

    shots.forEach(({ src, fallback }, i) => {
      const fig = document.createElement('button');
      fig.type = 'button';
      fig.className = 'gallery-item';
      fig.setAttribute('aria-label', `Photo ${i + 1} of ${shots.length} — click to enlarge`);
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${l.address || 'Listing'} — photo ${i + 1}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      if (fallback) {
        img.addEventListener('error', () => { img.src = fallback; }, { once: true });
      }
      fig.appendChild(img);
      fig.addEventListener('click', () => openLightbox(shots, i, l));
      strip.appendChild(fig);
    });
  }

  function openLightbox(shots, startIndex, l) {
    let i = startIndex;
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = `
      <button class="lb-close" type="button" aria-label="Close">&times;</button>
      <button class="lb-nav lb-prev" type="button" aria-label="Previous photo">&#8249;</button>
      <img class="lb-img" alt="">
      <button class="lb-nav lb-next" type="button" aria-label="Next photo">&#8250;</button>
      <p class="lb-caption"></p>`;

    const img = box.querySelector('.lb-img');
    const cap = box.querySelector('.lb-caption');
    const show = () => {
      const s = shots[i];
      img.src = s.src;
      img.onerror = s.fallback ? () => { img.src = s.fallback; img.onerror = null; } : null;
      img.alt = `${l.address || 'Listing'} — photo ${i + 1}`;
      cap.textContent = `${i + 1} / ${shots.length} · ${l.address || ''}`;
    };
    const step = (d) => { i = (i + d + shots.length) % shots.length; show(); };
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }

    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    box.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);

    show();
    document.body.appendChild(box);
  }

  // ---------- notes thread ----------
  function setupNotesSection(card, l) {
    const threadEl = card.querySelector('[data-slot="thread"]');
    const composerTa = card.querySelector('[data-slot="composer"]');
    const postBtn = card.querySelector('[data-action="post-note"]');
    const countEls = card.querySelectorAll('[data-slot="note-count"]');

    renderWhoChips(card.querySelector('[data-slot="who-chips"]'));

    const renderThread = (notes) => {
      state.notesByListing[l.id] = notes;
      state.noteCounts[l.id] = notes.length;
      threadEl.innerHTML = '';
      if (!notes.length) {
        const li = document.createElement('li');
        li.className = 'thread-empty';
        li.textContent = 'No notes yet — add the first one.';
        threadEl.appendChild(li);
      }
      notes.forEach((n) => threadEl.appendChild(noteCard(n, l)));
      countEls.forEach((c) => { c.textContent = notes.length; });
      // refresh marker dot for this listing only
      const m = state.markers.get(l.id);
      if (m) m.setIcon(buildIcon(l, { selected: state.selectedId === l.id }));
      updateSheetSummary();
    };

    // unsubscribe any prior listener
    if (state.currentNoteUnsub) { state.currentNoteUnsub(); state.currentNoteUnsub = null; }

    if (state.backend === 'firebase' && window.NYCFirebase) {
      state.currentNoteUnsub = window.NYCFirebase.onListingNotes(l.id, renderThread);
    } else {
      renderThread(state.notesByListing[l.id] || []);
    }

    const setStatus = (text, isError) => {
      const span = card.querySelector('[data-bind="note-status"]');
      span.textContent = text;
      span.classList.toggle('is-error', !!isError);
      if (text) setTimeout(() => { span.textContent = ''; span.classList.remove('is-error'); }, 1800);
    };

    const post = async () => {
      const text = composerTa.value.trim();
      if (!text) return;
      if (!state.author) { setStatus('pick your name first', true); return; }
      postBtn.disabled = true;
      try {
        if (state.backend === 'firebase' && window.NYCFirebase) {
          await window.NYCFirebase.addNote(l.id, text, state.author);
        } else {
          // local fallback
          const list = state.notesByListing[l.id] || [];
          list.push({
            id: 'local-' + Date.now(),
            text,
            author: state.author,
            uid: 'local',
            createdAt: Date.now(),
          });
          state.notesByListing[l.id] = list;
          saveStore(STORAGE_NOTES, state.notesByListing);
          renderThread(list);
        }
        composerTa.value = '';
        setStatus('posted');
      } catch (err) {
        console.error('post failed', err);
        setStatus('post failed — ' + (err.message || 'unknown'), true);
      } finally {
        postBtn.disabled = false;
      }
    };

    postBtn.addEventListener('click', post);
    composerTa.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); post(); }
    });
    // Grow with content so long notes stay readable while typing on a phone.
    const autogrow = () => {
      composerTa.style.height = 'auto';
      composerTa.style.height = Math.min(composerTa.scrollHeight, 180) + 'px';
    };
    composerTa.addEventListener('input', autogrow);
    autogrow();

    setupNotesChrome(card);
  }

  /** Collapse/expand the notes block, and the full-screen focus mode. */
  function setupNotesChrome(card) {
    const section = card.querySelector('.detail-notes');
    if (!section) return;

    const open = localStorage.getItem(STORAGE_NOTES_OPEN) !== '0';
    const applyOpen = (isOpen) => {
      section.classList.toggle('is-collapsed', !isOpen);
      card.querySelector('[data-action="toggle-notes"]')?.setAttribute('aria-expanded', String(isOpen));
      localStorage.setItem(STORAGE_NOTES_OPEN, isOpen ? '1' : '0');
    };
    applyOpen(open);

    card.querySelector('[data-action="toggle-notes"]')?.addEventListener('click', () => {
      applyOpen(section.classList.contains('is-collapsed'));
    });

    // The mobile sheet is transform:translateY(...), which makes it the
    // containing block for position:fixed — an overlay left inside it renders
    // *under* the topbar and Leaflet controls. Portal to <body> instead.
    let placeholder = null;

    const enterFullscreen = () => {
      if (placeholder) return;
      placeholder = document.createComment('notes-slot');
      section.parentNode.insertBefore(placeholder, section);
      document.body.appendChild(section);
      document.body.classList.add('notes-fullscreen');
      applyOpen(true);
      setExpandLabel(true);
      section.querySelector('[data-slot="composer"]')?.focus({ preventScroll: true });
    };

    const exitFullscreen = () => {
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(section, placeholder);
        placeholder.remove();
      }
      placeholder = null;
      document.body.classList.remove('notes-fullscreen');
      setExpandLabel(false);
    };

    function setExpandLabel(on) {
      card.querySelectorAll('.notes-expand').forEach((b) => {
        b.setAttribute('aria-label', on ? 'Close full screen notes' : 'Expand notes to full screen');
        b.title = on ? 'Close' : 'Expand notes';
      });
    }

    // Let Escape / selecting another listing tear the overlay down properly,
    // not just drop the class and strand the section on <body>.
    state.exitNotesFullscreen = exitFullscreen;

    card.querySelectorAll('[data-action="expand-notes"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (document.body.classList.contains('notes-fullscreen')) exitFullscreen();
        else enterFullscreen();
      });
    });
  }

  function noteCard(n, l) {
    const li = document.createElement('li');
    li.className = 'note-card';
    const isMine = (state.backend === 'firebase')
      ? (window.NYCFirebase && n.uid && n.uid === window.NYCFirebase.uid)
      : (n.uid === 'local');
    if (isMine) li.classList.add('is-mine');

    const head = document.createElement('div');
    head.className = 'note-head';
    head.innerHTML = `<span class="note-author">${escape(n.author || 'anonymous')}</span><span class="note-time">${fmtTime(n.createdAt)}</span>`;
    li.appendChild(head);

    const body = document.createElement('p');
    body.className = 'note-body';
    body.textContent = n.text || '';
    li.appendChild(body);

    if (isMine) {
      const row = document.createElement('div');
      row.className = 'note-actions-row';
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this note?')) return;
        try {
          if (state.backend === 'firebase' && window.NYCFirebase) {
            await window.NYCFirebase.deleteNote(l.id, n.id);
            // Firebase listener will refresh the thread automatically.
          } else {
            state.notesByListing[l.id] = (state.notesByListing[l.id] || []).filter((x) => x.id !== n.id);
            state.noteCounts[l.id] = state.notesByListing[l.id].length;
            saveStore(STORAGE_NOTES, state.notesByListing);
            li.remove();
            const marker = state.markers.get(l.id);
            if (marker) marker.setIcon(buildIcon(l, { selected: state.selectedId === l.id }));
            updateSheetSummary();
          }
        } catch (err) { console.error('delete failed', err); }
      });
      row.appendChild(del);
      li.appendChild(row);
    }

    return li;
  }

  function fmtTime(ms) {
    if (!ms) return 'just now';
    const diff = Date.now() - ms;
    if (diff < 45 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + 'm';
    if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + 'h';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.round(diff / 86400000) + 'd';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------- status chips ----------
  function renderStatusChips(card, l) {
    const box = card.querySelector('[data-slot="status-chips"]');
    box.innerHTML = '';
    const current = state.status[l.id];
    STATUS_OPTIONS.forEach((opt) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.textContent = opt;
      c.dataset.active = String(current === opt);
      c.dataset.opt = opt;
      c.addEventListener('click', async () => {
        const next = state.status[l.id] === opt ? null : opt;
        state.status[l.id] = next;
        if (state.backend === 'firebase' && window.NYCFirebase) {
          try { await window.NYCFirebase.setStatus(l.id, next); }
          catch (err) { console.error('status set failed', err); }
        } else {
          if (next) state.status[l.id] = next; else delete state.status[l.id];
          saveStore(STORAGE_STATUS, state.status);
        }
        refreshStatusChips();
      });
      box.appendChild(c);
    });
  }

  function refreshStatusChips() {
    const card = el('#detail-scroll .detail-card');
    if (!card || !state.selectedId) return;
    const current = state.status[state.selectedId];
    els('.status-chips .chip', card).forEach((c) => {
      c.dataset.active = String(c.dataset.opt === current);
    });
  }

  // ---------- detail field helpers ----------
  function field(label, valueHtml, opts = {}) {
    const frag = document.createDocumentFragment();
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (opts.mono) dd.classList.add('mono');
    if (opts.className) {
      dt.classList.add(opts.className);
      dd.classList.add(opts.className);
    }
    dd.innerHTML = valueHtml;
    frag.appendChild(dt);
    frag.appendChild(dd);
    return frag;
  }

  // Whole-unit rent, when the listing is priced for the entire apartment
  // (portals quote it that way) rather than per room. Only meaningful on
  // multi-bed units — on a 1-bed the total and the per-room price are the same.
  function wholeUnitRent(l) {
    if (!l.price_total || !l.beds_in_unit || l.beds_in_unit < 2) return null;
    return `$${l.price_total.toLocaleString()}/mo whole unit · ${l.beds_in_unit} beds`;
  }

  function priceCell(l) {
    if (priceMode(l) === 'total') {
      return `<span class="price">${fmtPrice(l)}<small>/ mo</small></span>`;
    }
    const whole = wholeUnitRent(l);
    return `<span class="price">${fmtPrice(l)}<small>/ room / mo</small></span>`
      + (whole ? `<span class="price-whole">${escape(whole)}</span>` : '');
  }

  function formatContact(l) {
    if (l.contact_phone) {
      const tel = String(l.contact_phone).replace(/[^\d+]/g, '');
      const hours = l.contact_hours ? ` · ${escape(l.contact_hours)}` : '';
      return `<a href="tel:${tel}" style="color:inherit">${escape(l.contact_phone)}</a>${hours}`;
    }
    if (l.listing_type) return escape(l.listing_type);
    return '—';
  }

  function roomsTable(rooms) {
    const head = `<tr><th>Room</th><th>Price</th><th>Phone</th><th>Avail</th><th>Notes</th></tr>`;
    const rows = rooms.map((r) => `
      <tr>
        <td>${escape(r.room || '—')}</td>
        <td class="mono">${escape(r.price || '—')}</td>
        <td class="mono">${escape(r.phone || '—')}</td>
        <td>${escape(r.avail || '—')}</td>
        <td>${escape(r.notes || '')}</td>
      </tr>
    `).join('');
    return `<table>${head}${rows}</table>`;
  }

  function bindText(root, key, value) {
    const node = root.querySelector(`[data-bind="${key}"]`);
    if (node) node.textContent = value;
  }

  // ---------- minimal markdown for body summary ----------
  function mdToHtml(md) {
    if (!md) return '';
    const lines = md.split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { if (inList) { out.push('</ul>'); inList = false; } out.push(''); continue; }
      if (trimmed.startsWith('### ')) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<p><strong>${escape(trimmed.slice(4))}</strong></p>`); continue; }
      if (trimmed.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false; } continue; }
      if (trimmed.startsWith('# ')) { continue; }
      if (trimmed.startsWith('|')) continue;
      if (trimmed.startsWith('- ')) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
        continue;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  function formatInline(s) {
    return escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- mobile chrome (drawer + bottom sheet) ----------
  function setupChrome() {
    const fab = el('#fab-filters');
    const close = el('#drawer-close');
    const scrim = el('#drawer-scrim');
    const handle = el('#sheet-handle');

    if (fab) fab.addEventListener('click', openDrawer);
    if (close) close.addEventListener('click', closeDrawer);
    if (scrim) {
      // Track if the touch sequence had >1 active fingers — if so, treat it
      // as a pinch / multi-touch gesture and DO NOT close the drawer when
      // the finger lifts. Otherwise pinch-zooming near the drawer edge
      // would dismiss it.
      let multitouch = false;
      scrim.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) multitouch = true;
      }, { passive: true });
      scrim.addEventListener('touchend', () => {
        // reset on the next macrotask so the click handler below can read it
        setTimeout(() => { multitouch = false; }, 0);
      }, { passive: true });
      scrim.addEventListener('click', () => {
        if (multitouch) return;
        closeDrawer();
        collapseSheet();
      });
    }
    if (handle) handle.addEventListener('click', toggleSheet);

    // Close drawer on Escape; collapse sheet on second Escape
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
      if (document.body.classList.contains('sheet-expanded')) { collapseSheet(); return; }
    });

    // When the map size changes (drawer toggle / orientation), invalidate
    const ro = new ResizeObserver(() => state.map?.invalidateSize());
    ro.observe(el('#map'));

    // Initial sheet state on mobile: collapsed (peek)
    collapseSheet();
    updateSheetSummary();
  }

  function openDrawer() {
    document.body.classList.add('drawer-open');
    queueMicrotask(() => state.map?.invalidateSize());
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    queueMicrotask(() => state.map?.invalidateSize());
  }
  function openSheet() {
    document.body.classList.add('sheet-expanded');
    queueMicrotask(() => state.map?.invalidateSize());
  }
  function collapseSheet() {
    document.body.classList.remove('sheet-expanded');
    queueMicrotask(() => state.map?.invalidateSize());
  }
  function toggleSheet() {
    if (document.body.classList.contains('sheet-expanded')) collapseSheet();
    else openSheet();
  }

  function updateSheetSummary() {
    const titleEl = el('#sheet-title');
    const metaEl  = el('#sheet-meta');
    if (!titleEl || !metaEl) return;
    if (state.selectedId) {
      const l = state.listings.find((x) => x.id === state.selectedId);
      if (l) {
        titleEl.textContent = l.address || l.title;
        const noteN = state.noteCounts[l.id] || 0;
        const noteStr = noteN ? ` · ${noteN} note${noteN === 1 ? '' : 's'}` : '';
        const wholeStr = priceMode(l) === 'room' && l.price_total && l.beds_in_unit > 1
          ? ` · $${l.price_total.toLocaleString()} unit` : '';
        metaEl.textContent =
          `${fmtPrice(l)}${priceUnit(l)}${wholeStr} · ${l.miles_to_nyu ?? '—'}mi${noteStr}`;
        return;
      }
    }
    titleEl.textContent = 'All listings';
    metaEl.textContent = 'tap a marker for details';
  }

  // ---------- author ----------
  // ---------- identity ----------

  /** Render the roster as a radio-style chip group into `host`. */
  function renderWhoChips(host) {
    if (!host) return;
    host.innerHTML = '';
    PEOPLE.forEach((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'who-chip';
      b.dataset.person = name;
      b.textContent = name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.author === name));
      b.classList.toggle('active', state.author === name);
      b.addEventListener('click', () => setAuthor(state.author === name ? '' : name));
      host.appendChild(b);
    });
  }

  function setAuthor(name) {
    state.author = name;
    if (name) localStorage.setItem(STORAGE_AUTHOR, name);
    else localStorage.removeItem(STORAGE_AUTHOR);
    refreshIdentityUI();
  }

  /** Keep every chip group + composer byline in sync after a change. */
  function refreshIdentityUI() {
    els('.who-chips').forEach(renderWhoChips);
    els('[data-action="post-note"]').forEach((btn) => { btn.disabled = !state.author; });
    els('[data-slot="composer-hint"]').forEach((h) => {
      h.textContent = state.author ? `Posting as ${state.author}` : 'Pick your name to post';
      h.classList.toggle('is-warn', !state.author);
    });
  }

  function setupAuthorInput() {
    renderWhoChips(el('#author-chips'));
    refreshIdentityUI();
  }

  // ---------- keyboard ----------
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Full-screen notes swallow the first Escape, so it can't also deselect.
      if (e.key === 'Escape' && document.body.classList.contains('notes-fullscreen')) {
        state.exitNotesFullscreen?.();
        return;
      }
      if (e.key === 'Escape' && state.selectedId
          && !document.body.classList.contains('drawer-open')
          && !document.body.classList.contains('sheet-expanded')) {
        state.selectedId = null;
        state.exitNotesFullscreen?.();
        state.exitNotesFullscreen = null;
        if (state.currentNoteUnsub) { state.currentNoteUnsub(); state.currentNoteUnsub = null; }
        refreshSelectedMarker();
        const root = el('#detail-scroll');
        root.innerHTML = '';
        root.appendChild(emptyState());
        updateSheetSummary();
      }
    });
  }

  function emptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'detail-empty';
    wrap.innerHTML = `
      <p class="detail-eyebrow">No listing selected</p>
      <h2>Tap a marker to inspect</h2>
      <p class="detail-help">Each pin is one address. Click for full details, contact info, status, and a shared notes thread synced across everyone viewing this map.</p>
      <ul id="quick-list" class="quick-list" aria-label="All listings"></ul>
    `;
    queueMicrotask(renderQuickList);
    return wrap;
  }

  // go
  init();
})();
