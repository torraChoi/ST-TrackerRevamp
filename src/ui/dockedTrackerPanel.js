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
  ensureDock('right');

  stopMirroring();

  const getSource = () => document.querySelector('#trackerInterfaceContents');

  // Copy immediately if available
  const first = getSource();
  if (first) setDockHTML(first.innerHTML);

  // Watch the whole tracker interface for re-renders / replacements
  const host = document.querySelector('#trackerInterface') || document.body;

  let lastSource = first || null;

  observer = new MutationObserver(() => {
    const src = getSource();

    // If the contents element got replaced, update reference
    if (src && src !== lastSource) {
      lastSource = src;
      setDockHTML(src.innerHTML);
      return;
    }

    // If same element, just mirror its current HTML
    if (src) {
      setDockHTML(src.innerHTML);
    }
  });

  observer.observe(host, { childList: true, subtree: true, characterData: true });
  console.log('[TrackerRevamp] Dock is mirroring tracker (resilient)');
}


export function stopMirroring() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
