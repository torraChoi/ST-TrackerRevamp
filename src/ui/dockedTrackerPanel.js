let isMirroringActive = false;

let dockEl = null;
let observer = null;
let dockToggleBtn = null;

function ensureDockToggleButton() {
  if (dockToggleBtn) return dockToggleBtn;

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

  dockToggleBtn.addEventListener('click', () => {
    if (!dockEl) {
      startMirroringTrackerContents();
    }
  });

  document.body.appendChild(dockToggleBtn);
  return dockToggleBtn;
}


export function ensureDock(side = 'right') {
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
  stopMirroring();

  dockEl.remove();
  dockEl = null;

  ensureDockToggleButton();
});


  dockEl.querySelector('#trackerrevamp-dock-pin')?.addEventListener('click', () => {
    const next = dockEl.dataset.side === 'left' ? 'right' : 'left';
    dockEl.dataset.side = next;
    dockEl.classList.toggle('is-left', next === 'left');
    dockEl.classList.toggle('is-right', next === 'right');
  });

  // initial side
  dockEl.classList.add(side === 'left' ? 'is-left' : 'is-right');

  return dockEl;
}

function setDockHTML(html) {
  const body = dockEl?.querySelector('#trackerrevamp-dock-body');
  if (body) body.innerHTML = html ?? '';
}

export function startMirroringTrackerContents() {
  if (isMirroringActive) {
    console.warn('[TrackerRevamp] mirroring already active, skipping');
    return;
  }

  const source = document.querySelector('#trackerInterfaceContents');
  const host = document.querySelector('#trackerInterface');

  if (!source || !host) {
    console.warn('[TrackerRevamp] tracker interface not ready yet');
    return;
  }

  isMirroringActive = true;

  ensureDock('right');
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

