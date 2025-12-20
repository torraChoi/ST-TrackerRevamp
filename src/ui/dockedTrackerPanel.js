let isMirroringActive = false;

let dockEl = null;
let observer = null;
let dockToggleBtn = null;

let currentDockSide = 'left';

let lastKnownTrackerHTML = '';
let retryTimer = null;
let userClosedDock = false;

function installOgTrackerCloseHijack() {
  // Capture-phase click handler so we can intercept before the original close handler runs
  document.addEventListener('click', (e) => {
    const tracker = document.querySelector('#trackerInterface');
    if (!tracker) return;

    // Only care about clicks inside the OG tracker window
    if (!tracker.contains(e.target)) return;

    // Try to detect a "close" click
    const closeBtn =
      e.target.closest('#trackerInterface .close') ||
      e.target.closest('#trackerInterface .fa-xmark') ||
      e.target.closest('#trackerInterface .fa-times') ||
      e.target.closest('#trackerInterface button[title*="Close"]') ||
      e.target.closest('#trackerInterface button[aria-label*="Close"]');

    if (!closeBtn) return;

    // Hijack: prevent default close behavior and hide instead
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    tracker.style.display = 'none';
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

