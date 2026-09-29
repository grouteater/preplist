// Small iOS-style UI helpers: escaping, bottom sheets, action sheets,
// toast, swipe to delete, FLIP list animation, collapsing nav title.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  check: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.4l2.9 2.9 6.1-6.6" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg class="row-chevron" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 4.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg class="plus-icon" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#FFD60A"/><path d="M11 6v10M6 11h10" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="16.5" cy="12" r="1.4" fill="currentColor"/></svg>',
  compose: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.5 3.5l3 3L12 15l-3.8.8L9 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  share: '<svg class="share-glyph" viewBox="0 0 14 16" aria-hidden="true"><path d="M7 1v9M4 4l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 6.5H3a1 1 0 0 0-1 1V14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7.5a1 1 0 0 0-1-1H9.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  listIcon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.5" fill="currentColor"/><circle cx="4.5" cy="12" r="1.5" fill="currentColor"/><circle cx="4.5" cy="18" r="1.5" fill="currentColor"/></svg>',
};

export function checkbox(on, action, id) {
  return `<button class="check ${on ? 'on' : ''}" data-action="${action}" data-id="${esc(id)}" aria-label="${on ? 'Uncheck' : 'Check'}" role="checkbox" aria-checked="${on}"><span class="circle">${ICONS.check}</span></button>`;
}

export function stepper(key, value, min = 1, max = 99) {
  return `<div class="stepper" data-stepper="${esc(key)}" data-min="${min}" data-max="${max}"><button data-step="-1" aria-label="Decrease">&minus;</button><span class="sv">${esc(value)}</span><button data-step="1" aria-label="Increase">+</button></div>`;
}

export function switchInput(name, on, attrs = '') {
  return `<label class="switch"><input type="checkbox" name="${esc(name)}" ${on ? 'checked' : ''} ${attrs}><span></span></label>`;
}

/* ---------------- Toast ---------------- */
let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------- Bottom sheets ---------------- */
const openSheets = [];

/**
 * Open a bottom sheet.
 * opts: { title, left: {label, action}, right: {label, action, bold}, body (html), full, onMount(el, close), onClose }
 * Header buttons call action(el, close). Returning false keeps the sheet open.
 */
export function openSheet(opts) {
  const root = document.getElementById('sheet-root');
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const el = document.createElement('div');
  el.className = 'sheet' + (opts.full ? ' full' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', opts.title || 'Sheet');
  const left = opts.left === null ? '' : `<button class="nav-btn" data-sheet="left">${esc((opts.left && opts.left.label) || 'Cancel')}</button>`;
  const right = opts.right ? `<button class="nav-btn ${opts.right.bold !== false ? 'bold' : ''}" data-sheet="right">${esc(opts.right.label)}</button>` : '';
  el.innerHTML = `<div class="grabber"></div><div class="sheet-head"><div class="nav-side left">${left}</div><div class="st">${esc(opts.title || '')}</div><div class="nav-side right">${right}</div></div><div class="sheet-body">${opts.body || ''}</div>`;
  root.appendChild(back);
  root.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.remove('show');
    back.classList.remove('show');
    const i = openSheets.indexOf(close);
    if (i >= 0) openSheets.splice(i, 1);
    setTimeout(() => {
      el.remove();
      back.remove();
    }, 340);
    if (opts.onClose) opts.onClose();
  };
  openSheets.push(close);
  back.addEventListener('click', close);
  el.querySelector('[data-sheet="left"]')?.addEventListener('click', async () => {
    if (opts.left && opts.left.action) {
      const r = await opts.left.action(el, close);
      if (r === false) return;
    }
    close();
  });
  el.querySelector('[data-sheet="right"]')?.addEventListener('click', async () => {
    const r = opts.right.action ? await opts.right.action(el, close) : undefined;
    if (r !== false) close();
  });
  // Drag the header down to dismiss.
  const head = el.querySelector('.sheet-head');
  const grab = el.querySelector('.grabber');
  let startY = null;
  let dy = 0;
  const onStart = (e) => {
    if (e.target.closest('button')) return;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    dy = 0;
    el.style.transition = 'none';
  };
  const onMove = (e) => {
    if (startY == null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dy = Math.max(0, y - startY);
    el.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (startY == null) return;
    startY = null;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > 110) close();
  };
  for (const h of [head, grab]) {
    h.addEventListener('touchstart', onStart, { passive: true });
    h.addEventListener('touchmove', onMove, { passive: true });
    h.addEventListener('touchend', onEnd);
  }
  requestAnimationFrame(() => {
    back.classList.add('show');
    el.classList.add('show');
  });
  if (opts.onMount) opts.onMount(el, close);
  return { el, close };
}

export function closeTopSheet() {
  const c = openSheets[openSheets.length - 1];
  if (c) c();
}

/** iOS-style action sheet. Resolves with the chosen value, or null if cancelled. */
export function actionSheet(title, options, message = '') {
  return new Promise((resolve) => {
    let chosen = null;
    const body =
      (message ? `<div class="group-footer" style="padding-top:0;padding-bottom:12px">${esc(message)}</div>` : '') +
      `<div class="group">${options
        .map((o, i) => `<button class="row tappable" data-i="${i}" style="width:100%;justify-content:center"><span class="row-title" style="color:${o.danger ? 'var(--red)' : 'var(--accent)'}">${esc(o.label)}</span></button>`)
        .join('')}</div>`;
    openSheet({
      title,
      body,
      onMount(el, close) {
        el.querySelectorAll('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            chosen = options[+b.dataset.i].value;
            close();
          }),
        );
      },
      onClose: () => resolve(chosen),
    });
  });
}

export function confirmSheet(title, message, label = 'Delete', danger = true) {
  return actionSheet(title, [{ label, value: true, danger }], message).then((v) => v === true);
}

/** Simple text prompt in a sheet. */
export function promptSheet(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title,
      right: {
        label: 'Done',
        action: (el) => {
          result = el.querySelector('input').value.trim();
        },
      },
      body: `<div class="spacer"></div><div class="group"><div class="row"><input class="text-input" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" enterkeyhint="done"></div></div>`,
      onMount(el, close) {
        const inp = el.querySelector('input');
        setTimeout(() => inp.focus(), 350);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            result = inp.value.trim();
            close();
          }
        });
      },
      onClose: () => resolve(result),
    });
  });
}

/* ---------------- Swipe to delete ---------------- */
let openSwipe = null;
export function closeOpenSwipe(except) {
  if (openSwipe && openSwipe !== except) {
    const r = openSwipe.querySelector(':scope > .row');
    if (r) r.style.transform = '';
    const w = openSwipe;
    w.classList.remove('open');
    setTimeout(() => { if (!w.classList.contains('open')) w.classList.remove('revealing'); }, 260);
    openSwipe = null;
  }
}

/**
 * Enable swipe-to-delete for every .swipe inside container.
 * onDelete(id, el) is called for a full swipe or a tap on Delete.
 */
export function enableSwipe(container, onDelete) {
  const REVEAL = 88;
  container.querySelectorAll('.swipe').forEach((wrap) => {
    if (wrap.dataset.swipeBound) return;
    wrap.dataset.swipeBound = '1';
    const row = wrap.querySelector(':scope > .row');
    let x0 = 0, y0 = 0, dx = 0, decided = null, base = 0, width = 0;
    wrap.addEventListener('touchstart', (e) => {
      if (e.target.closest('input[type="range"]')) { decided = 'v'; return; }
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; dx = 0; decided = null;
      base = wrap.classList.contains('open') ? -REVEAL : 0;
      width = wrap.offsetWidth;
      closeOpenSwipe(wrap);
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
      if (decided === 'v') return;
      const t = e.touches[0];
      const mx = t.clientX - x0, my = t.clientY - y0;
      if (!decided) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        decided = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
        if (decided === 'h') wrap.classList.add('dragging', 'revealing');
      }
      if (decided !== 'h') return;
      e.preventDefault();
      dx = Math.min(0, base + mx);
      row.style.transform = `translateX(${dx}px)`;
    }, { passive: false });
    wrap.addEventListener('touchend', () => {
      if (decided !== 'h') return;
      wrap.classList.remove('dragging');
      wrap.dataset.justSwiped = '1';
      setTimeout(() => delete wrap.dataset.justSwiped, 300);
      if (dx < -width * 0.55) {
        row.style.transform = `translateX(${-width}px)`;
        setTimeout(() => onDelete(wrap.dataset.id, wrap), 180);
      } else if (dx < -REVEAL / 2) {
        row.style.transform = `translateX(${-REVEAL}px)`;
        wrap.classList.add('open');
        openSwipe = wrap;
      } else {
        row.style.transform = '';
        wrap.classList.remove('open');
        setTimeout(() => { if (!wrap.classList.contains('open')) wrap.classList.remove('revealing'); }, 260);
      }
    });
    wrap.querySelector('.swipe-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(wrap.dataset.id, wrap);
    });
  });
}
document.addEventListener('touchstart', (e) => {
  if (openSwipe && !openSwipe.contains(e.target)) closeOpenSwipe();
}, { passive: true });

export function swipeWrap(id, innerRowHtml, extraClass = '') {
  return `<div class="swipe ${extraClass}" data-id="${esc(id)}"><button class="swipe-del" tabindex="-1">Delete</button>${innerRowHtml}</div>`;
}

/* ---------------- FLIP animation for reordering ---------------- */
export function flipCapture(container) {
  const map = new Map();
  container.querySelectorAll('[data-flip]').forEach((el) => map.set(el.dataset.flip, el.getBoundingClientRect().top));
  return map;
}
export function flipPlay(container, before) {
  container.querySelectorAll('[data-flip]').forEach((el) => {
    const old = before.get(el.dataset.flip);
    if (old == null) return;
    const now = el.getBoundingClientRect().top;
    const d = old - now;
    if (Math.abs(d) < 1) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${d}px)`;
    el.style.position = 'relative';
    el.style.zIndex = '3';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.42s cubic-bezier(0.25, 0.9, 0.3, 1)';
        el.style.transform = '';
        const done = () => { el.style.zIndex = ''; el.style.transition = ''; el.removeEventListener('transitionend', done); };
        el.addEventListener('transitionend', done);
      });
    });
  });
}

/* ---------------- Collapsing large title ---------------- */
let titleObserver = null;
export function watchLargeTitle(section) {
  const nav = document.getElementById('nav');
  const t = section.querySelector('.large-title');
  if (titleObserver) titleObserver.disconnect();
  if (!t) {
    nav.classList.add('scrolled');
    return;
  }
  const navH = nav.getBoundingClientRect().height;
  titleObserver = new IntersectionObserver(
    ([entry]) => nav.classList.toggle('scrolled', !entry.isIntersecting),
    { rootMargin: `-${Math.round(navH)}px 0px 0px 0px`, threshold: 0 },
  );
  titleObserver.observe(t);
}

export function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (e) { /* iOS Safari has no vibration API */ }
}
