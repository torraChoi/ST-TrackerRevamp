let isMirroringActive = false;

let dockEl = null;
let observer = null;
let dockToggleBtn = null;

let currentDockSide = 'left';

let lastKnownTrackerHTML = '';
let retryTimer = null;
let userClosedDock = false;
let ogHijackInstalled = false;

let autoHideOgOnce = true;
let ogAppearObserver = null;


function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitKeyValue(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;

  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();

  if (!key) return null;
  if (!value) return null; // treat "MainCharacters:" as non-editable header

  return { key, value };
}

/**
 * Render an editable dock view from the OG tracker DOM.
 * Adds data-line-index so we can write back edits into OG.
 */
function renderEditableDockFromOg(sourceEl) {
  const fields = [...sourceEl.querySelectorAll('.tracker-view-field')];

  return fields.map((el, i) => {
    const raw = el.textContent.trim();
    const kv = splitKeyValue(raw);

    // Non key:value (or header) -> render as plain line
    if (!kv) {
      return `<div class="tr-line tr-plain" data-line-index="${i}">${escapeHtml(raw)}</div>`;
    }

    return `
      <div class="tr-line" data-line-index="${i}">
        <span class="tr-key">${escapeHtml(kv.key)}:</span>
        <span class="tr-editable" data-key="${escapeHtml(kv.key)}">${escapeHtml(kv.value)}</span>
      </div>
    `;
  }).join('');
}



export function startOgAutoHideWatcher() {
  if (ogAppearObserver) return;

  ogAppearObserver = new MutationObserver(() => {
    if (!autoHideOgOnce) return;

    const og = document.querySelector('#trackerInterface');
    if (!og) return;

    // If it's visible, hide it once
    if (window.getComputedStyle(og).display !== 'none') {
      hideOgTracker();
      autoHideOgOnce = false;
      console.log('[TrackerRevamp] OG auto-hidden once');
    }
  });

  ogAppearObserver.observe(document.body, { childList: true, subtree: true });
}


export function autoStartDockOnChat() {
  // Don’t spam open if user explicitly closed dock
  if (typeof userClosedDock !== 'undefined' && userClosedDock) return;

  // Ensure dock toggle button exists (optional)
  ensureDockToggleButton?.();

  // Make sure dock is open
  startMirroringTrackerContents();
}




export function installOgTrackerCloseHijack() {
    if (ogHijackInstalled) return;
    ogHijackInstalled = true;

  // Capture-phase click handler so we can intercept before the original close handler runs
  document.addEventListener('click', (e) => {
    const tracker = document.querySelector('#trackerInterface');
    if (!tracker) return;

    // Only care about clicks inside the OG tracker window
    if (!tracker.contains(e.target)) return;

    // Try to detect a "close" click
    const btn = e.target.closest('button, a, div, span');
    if (!btn) return;

    // Common cases: an X icon, × text, or anything labeled close
    const t = (btn.textContent || '').trim();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const cls = (btn.className || '').toString().toLowerCase();

    const looksLikeClose =
    t === '×' ||
    t === 'x' ||
    title.includes('close') ||
    aria.includes('close') ||
    cls.includes('close') ||
    cls.includes('xmark') ||
    cls.includes('times');

    if (!looksLikeClose) return;


    // Hijack: prevent default close behavior and hide instead
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    hideOgTracker();
    console.log('[TrackerRevamp] OG tracker hidden (not destroyed)');

  }, true); // <-- capture = true
}



function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}


function positionDockToggleButton() {
  if (!dockToggleBtn) return;

  dockToggleBtn.style.left = '';
  dockToggleBtn.style.right = '20px';
  dockToggleBtn.style.bottom = '20px';
  dockToggleBtn.style.zIndex = '10001';
}

function hideOgTracker() {
  const og = document.querySelector('#trackerInterface');
  if (!og) return false;

  // Store previous display so we can restore correctly
  const computed = window.getComputedStyle(og).display;
  if (computed && computed !== 'none') {
    og.dataset.prevDisplay = computed;
  }

  og.style.display = 'none';
  return true;
}

function showOgTracker() {
  const og = document.querySelector('#trackerInterface');
  if (!og) return false;

  // Restore previous display or fall back to block
  const prev = og.dataset.prevDisplay;
  og.style.display = prev && prev !== 'none' ? prev : 'block';

  // Make sure it’s not hiding behind your dock / UI
  og.style.zIndex = '9998';

  return true;
}



function ensureDockToggleButton() {
  if (dockToggleBtn) {
  dockToggleBtn.style.display = 'block';
  positionDockToggleButton();
  return dockToggleBtn;
}


  dockToggleBtn = document.createElement('button');
  dockToggleBtn.id = 'trackerrevamp-dock-toggle';
  dockToggleBtn.className = 'menu_button';
  dockToggleBtn.textContent = '📋 Tracker';
  dockToggleBtn.title = 'Show Tracker Dock';

  dockToggleBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    padding: 8px 12px;
    border-radius: 999px;
  `;

  positionDockToggleButton();

  dockToggleBtn.addEventListener('click', () => {
  userClosedDock = false;   // 👈 user wants it back
  clearRetryTimer();        // 👈 clear any stale retry loop
  startMirroringTrackerContents();
  dockToggleBtn.style.display = 'none';
});


  document.body.appendChild(dockToggleBtn);
  return dockToggleBtn;
}


export function ensureDock(side = 'right') {
    currentDockSide = side;
  if (dockEl) return dockEl;

  dockEl = document.createElement('div');
  dockEl.id = 'trackerrevamp-dock';
  dockEl.className = 'trackerrevamp-dock';
  dockEl.dataset.side = side;

  dockEl.innerHTML = `
    <div class="trackerrevamp-dock-header">
      <span class="trackerrevamp-dock-title">Tracker</span>
      <div class="trackerrevamp-dock-actions">
        <button id="trackerrevamp-og-toggle" class="menu_button" title="Show/Hide OG tracker">🛠</button>
        <button id="trackerrevamp-dock-pin" class="menu_button" title="Toggle side">⇄</button>
        <button id="trackerrevamp-dock-close" class="menu_button" title="Close">×</button>
      </div>
    </div>
    <div id="trackerrevamp-dock-body" class="trackerrevamp-dock-body"></div>
  `;

  document.body.appendChild(dockEl);

  dockEl.querySelector('#trackerrevamp-dock-close')?.addEventListener('click', () => {
  userClosedDock = true;      // 👈 user explicitly closed it
  clearRetryTimer();          // 👈 stop any pending auto-reopen
  stopMirroring();

  dockEl.remove();
  dockEl = null;

  ensureDockToggleButton();
});



  dockEl.querySelector('#trackerrevamp-dock-pin')?.addEventListener('click', () => {
  const next = dockEl.dataset.side === 'left' ? 'right' : 'left';
  dockEl.dataset.side = next;
  currentDockSide = next;

  dockEl.classList.toggle('is-left', next === 'left');
  dockEl.classList.toggle('is-right', next === 'right');

  positionDockToggleButton(); // 👈 add this
});


  // initial side
  dockEl.classList.add(side === 'left' ? 'is-left' : 'is-right');

  dockEl.querySelector('#trackerrevamp-og-toggle')?.addEventListener('click', () => {
  const og = document.querySelector('#trackerInterface');
  if (!og) {
    console.warn('[TrackerRevamp] OG tracker not found (can’t toggle)');
    return;
  }

  const isHidden = window.getComputedStyle(og).display === 'none';
  if (isHidden) showOgTracker();
  else hideOgTracker();
});



  return dockEl;
}

function installDockEditing() {
  document.addEventListener('click', (e) => {
    const editable = e.target.closest('.tr-editable');
    if (!editable) return;

    // Prevent re-enter if already editing
    if (editable.dataset.editing === '1') return;
    editable.dataset.editing = '1';

    const lineEl = editable.closest('.tr-line');
    const lineIndex = Number(lineEl?.dataset?.lineIndex);
    const key = editable.dataset.key;
    const oldValue = editable.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tr-input';
    input.value = oldValue;

    editable.textContent = '';
    editable.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const newValue = input.value.trim();

      // restore display
      editable.dataset.editing = '0';
      editable.innerHTML = escapeHtml(newValue);

      // ✅ write back into OG tracker UI so it stays consistent
      applyEditToOgTrackerLine(lineIndex, key, newValue);

      // (Optional) log
      console.log('[TrackerRevamp] Edited:', { lineIndex, key, newValue });
    };

    const cancel = () => {
      editable.dataset.editing = '0';
      editable.innerHTML = escapeHtml(oldValue);
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commit();
      if (ev.key === 'Escape') cancel();
    });

    input.addEventListener('blur', commit);
  }, true);
}

/**
 * Updates the OG tracker line text like "HP: 160/160".
 * We update by line index + key to be safe.
 */
function applyEditToOgTrackerLine(lineIndex, key, newValue) {
  const og = document.querySelector('#trackerInterfaceContents');
  if (!og) return;

  const fields = [...og.querySelectorAll('.tracker-view-field')];
  const el = fields[lineIndex];
  if (!el) return;

  const raw = el.textContent.trim();
  const kv = splitKeyValue(raw);

  // Only overwrite if the key matches what we edited
  if (!kv || kv.key !== key) return;

  el.textContent = `${key}: ${newValue}`;
}

installDockEditing();


function setDockHTML(html) {
  const body = dockEl?.querySelector('#trackerrevamp-dock-body');
  if (!body) return;

  body.innerHTML = html ?? '';

  // Cache last good content
  if (html && String(html).trim().length > 0) {
    lastKnownTrackerHTML = html;
  }
}


export function startMirroringTrackerContents() {
  if (isMirroringActive) {
    console.warn('[TrackerRevamp] mirroring already active, skipping');
    return;
  }

  const source = document.querySelector('#trackerInterfaceContents');
  const host = document.querySelector('#trackerInterface');

  if (!source || !host) {
  // Still open the dock even if OG tracker is closed
  ensureDock('left');

  if (dockToggleBtn) dockToggleBtn.style.display = 'none';

  if (lastKnownTrackerHTML) {
    setDockHTML(lastKnownTrackerHTML);
  } else {
    setDockHTML(`
      <div style="opacity:0.75; font-style:italic;">
        Tracker window is closed.<br/>
        Generate tracker again to display data here.
      </div>
    `);
  }

  // Try again later in case the tracker gets regenerated
  clearRetryTimer();

if (!userClosedDock) {
  retryTimer = setTimeout(() => {
    startMirroringTrackerContents();
  }, 1000);
}

  if (autoHideOgOnce) {
  hideOgTracker();
  autoHideOgOnce = false;
}


  isMirroringActive = false;
  return;
}



  isMirroringActive = true;

  ensureDock('left');
  if (dockToggleBtn) dockToggleBtn.style.display = 'none';

  stopMirroring();

  // initial copy
  setDockHTML(renderEditableDockFromOg(source));

  observer = new MutationObserver(() => {
    if (!dockEl) return;

    const current = document.querySelector('#trackerInterfaceContents');
    if (!current) return;

    setDockHTML(renderEditableDockFromOg(current));
  });

  observer.observe(source, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  console.log('[TrackerRevamp] Dock mirroring started safely');
}


export function stopMirroring() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isMirroringActive = false;
}

