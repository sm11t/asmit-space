/* Library view: book grid, resume card, delete. */

import * as store from './store.js';

let unsubBooks = null;
let booksCache = [];
let openBookCb = null;

export function initLibrary(onOpenBook) {
  openBookCb = onOpenBook;
}

export function showLibrary() {
  if (unsubBooks) unsubBooks();
  unsubBooks = store.onBooks((books) => {
    booksCache = books;
    renderGrid(books);
  });
  renderResumeCard();
}

export function hideLibrary() {
  if (unsubBooks) { unsubBooks(); unsubBooks = null; }
}

export function getBookFromCache(bookId) {
  return booksCache.find((b) => b.id === bookId) || null;
}

async function renderResumeCard() {
  const card = document.getElementById('resume-card');
  card.hidden = true;
  try {
    const prog = await store.getLastProgress();
    if (!prog) return;
    const book = await store.getBook(prog.bookId);
    if (!book || book.status !== 'ready') return;
    card.innerHTML = '';
    const kicker = elWith('div', 'resume-kicker', 'Pick up where you left off');
    const title = elWith('div', 'resume-title', book.title);
    const sub = elWith('div', 'resume-sub',
      `Page ${prog.pageNo} of ${book.pageCount} · ${Math.floor(prog.offsetSec / 60)}:${String(Math.floor(prog.offsetSec % 60)).padStart(2, '0')} in`);
    card.append(kicker, title, sub);
    card.onclick = () => openBookCb(book, { resume: true, autoplay: true });
    card.hidden = false;
  } catch (err) {
    console.warn('[library] resume card failed', err);
  }
}

function renderGrid(books) {
  const grid = document.getElementById('library-grid');
  const empty = document.getElementById('library-empty');
  grid.innerHTML = '';
  empty.hidden = books.length > 0;

  for (const book of books) {
    const card = document.createElement('button');
    card.className = 'book-card' + (book.status !== 'ready' ? ' processing' : '');

    const title = elWith('div', 'book-card-title', book.title);
    const meta = elWith('div', 'book-card-meta',
      book.status === 'ready'
        ? `${book.pageCount} page${book.pageCount === 1 ? '' : 's'}`
        : book.status === 'processing' ? 'Processing…' : 'Draft');

    const bar = document.createElement('div');
    bar.className = 'book-card-progressbar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    store.getProgress(book.id).then((p) => {
      if (p && book.pageCount) {
        fill.style.width = `${Math.round((p.pageNo / book.pageCount) * 100)}%`;
      }
    }).catch(() => {});

    const del = document.createElement('span');
    del.className = 'book-card-delete';
    del.textContent = '🗑';
    del.setAttribute('role', 'button');
    del.setAttribute('aria-label', `Delete ${book.title}`);
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${book.title}"? This removes its transcript and audio.`)) return;
      try {
        await store.deleteBook(book.id, book.pageCount);
      } catch (err) {
        console.error('[library] delete failed', err);
      }
    });

    card.append(title, meta, bar, del);
    card.addEventListener('click', () => {
      if (book.status === 'ready') openBookCb(book, { resume: true });
    });
    grid.appendChild(card);
  }
}

function elWith(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}
