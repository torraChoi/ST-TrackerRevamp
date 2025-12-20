let dockEl = null;
let observer = null;

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
  // Create the dock if needed
  ensureDock('right');

  const source = document.querySelector('#trackerInterfaceContents');
  if (!source) {
    console.warn('[TrackerRevamp] #trackerInterfaceContents not found (yet)');
    return;
  }

  // Copy once immediately
  setDockHTML(source.innerHTML);

  // Watch for changes and mirror
  stopMirroring();
  observer = new MutationObserver(() => {
    setDockHTML(source.innerHTML);
  });

  observer.observe(source, { childList: true, subtree: true, characterData: true });
  console.log('[TrackerRevamp] Dock is mirroring #trackerInterfaceContents');
}

export function stopMirroring() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
