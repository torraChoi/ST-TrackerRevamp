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
  og.style.zIndex = '10002';

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
  setDockHTML(source.innerHTML);

  observer = new MutationObserver(() => {
    if (!dockEl) return;

    const current = document.querySelector('#trackerInterfaceContents');
    if (!current) return;

    setDockHTML(current.innerHTML);
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

