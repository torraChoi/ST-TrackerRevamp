import { TrackerInterface } from './trackerInterface.js';
import { extensionSettings } from "../../index.js";


let isMirroringActive = false;

let dockEl = null;
let observer = null;
let dockToggleBtn = null;

let currentDockSide = "left";

let lastKnownTrackerHTML = "";
let retryTimer = null;
let userClosedDock = false;
let ogHijackInstalled = false;

let autoHideOgOnce = true;
let ogAppearObserver = null;

let isDockEditing = false;
let activeEditor = null; // { editableEl, lineIndex, key, input, oldValue }
let dockRefreshTimer = null;
let lastTrackerFingerprint = "";



function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEditedValue(key, raw) {
  if (raw == null) return '';
  let v = String(raw).trim();

  const k = String(key ?? '').trim();
  if (k) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    v = v.replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, 'i'), '');
  }

  return v.trim();
}

function setValueAtPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}


function splitKeyValue(line) {
  const idx = line.indexOf(":");
  if (idx === -1) return null;

  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();

  if (!key) return null;
  if (!value) return null; // treat "MainCharacters:" as non-editable header

  return { key, value };
}

function fingerprintTracker(tracker) {
  try {
    // Keep it cheap: stringify only once per tick
    return JSON.stringify(tracker);
  } catch {
    return String(Date.now());
  }
}

function refreshDock() {
  if (!dockEl) return;
  if (isDockEditing) return;

  const { tracker, schema } = getTrackerAndSchema();

  if (!tracker || !schema) {
    setDockHTML(`<div style="opacity:.75; font-style:italic;">No tracker data yet.</div>`);
    return;
  }

  const fp = fingerprintTracker(tracker);
  if (fp === lastTrackerFingerprint) return; // no change

  lastTrackerFingerprint = fp;
  setDockHTML(renderDockFromTracker(tracker, schema));
}



/**
 * Render an editable dock view from the OG tracker DOM.
 * Adds data-line-index so we can write back edits into OG.
 */
function getLeafTrackerFields(sourceEl) {
  const all = [...sourceEl.querySelectorAll(".tracker-view-field")];

  // Keep only "leaf" fields (fields that DON'T contain other .tracker-view-field inside)
  return all.filter((el) => !el.querySelector(".tracker-view-field"));
}

function extractKeyFromField(fieldEl) {
  // Try common label patterns first
  const labelEl =
    fieldEl.querySelector("label") ||
    fieldEl.querySelector(".tracker-view-label") ||
    fieldEl.querySelector(".tracker-view-key") ||
    fieldEl.querySelector(".tracker-label") ||
    fieldEl.querySelector("b, strong");

  if (labelEl) {
    const t = labelEl.textContent.trim();
    return t.endsWith(":") ? t.slice(0, -1).trim() : t;
  }

  // Fallback: scan child text nodes for something ending with :
  for (const n of fieldEl.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent.trim();
      if (t.endsWith(":")) return t.slice(0, -1).trim();
    }
  }

  // Last fallback: try splitting the full text
  const t = fieldEl.textContent.trim();
  const idx = t.indexOf(":");
  if (idx !== -1) return t.slice(0, idx).trim();

  return null;
}

function extractValueFromField(fieldEl) {
  // Prefer input/textarea values (this is your case)
  const input = fieldEl.querySelector("input, textarea");
  if (input) return (input.value ?? "").trim();

  // Else try a value span
  const valEl =
    fieldEl.querySelector(".tracker-view-value") ||
    fieldEl.querySelector(".tracker-value");

  if (valEl) return valEl.textContent.trim();

  // Fallback: if it's just plain text (headers like MainCharacters:)
  const t = fieldEl.textContent.trim();
  const idx = t.indexOf(":");
  if (idx !== -1) {
    const val = t.slice(idx + 1).trim();
    if (val) return val;
  }
  return t;
}

function getTrackerAndSchema() {
  const ti = TrackerInterface?.instance;
  const tracker = ti?.tracker;
  const schema = extensionSettings?.trackerDef;
  return { ti, tracker, schema };
}

function getAtPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

function coerceValueByType(type, raw) {
  const v = (raw ?? "").toString().trim();

  // Keep most things as string because Kaldigo tracker is string-heavy.
  // Only coerce ARRAY because it’s super common for your Items/Enemies lists.
  if (!type) return v;

  const t = String(type).toUpperCase();

  if (t === "ARRAY") {
    if (!v) return [];
    return v
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);
  }

  return v;
}


function renderDockFromTracker(tracker, schema) {
  if (!tracker || !schema) {
    return `<div style="opacity:.75; font-style:italic;">No tracker data yet.</div>`;
  }

  function renderGroup(title, depth) {
    return `
      <div class="tr-line tr-group" data-depth="${depth}">
        <div class="tr-group-title">${escapeHtml(title)}</div>
      </div>
    `;
  }

  function renderLeaf({ key, value, path, type, depth }) {
    const display =
      Array.isArray(value) ? value.join("; ") :
      (value ?? "").toString();

    return `
      <div class="tr-line" data-path="${escapeHtml(path)}" data-type="${escapeHtml(type ?? "")}" data-depth="${depth}">
        <span class="tr-key">${escapeHtml(key)}:</span>
        <span class="tr-editable" data-key="${escapeHtml(key)}">${escapeHtml(display)}</span>
      </div>
    `;
  }

  // Walk schema and tracker together
  function walkSchema(obj, schemaNode, basePath = "", depth = 0) {
    let html = "";

    for (const fieldSchema of Object.values(schemaNode)) {
      const name = fieldSchema.name;
      const type = fieldSchema.type;
      const nested = fieldSchema.nestedFields;

      const path = basePath ? `${basePath}.${name}` : name;
      const value = obj?.[name];

      const T = String(type || "").toUpperCase();

      // GROUP TYPES
      if (T === "OBJECT" && nested) {
        html += renderGroup(`${name}:`, depth);
        html += walkSchema(value || {}, nested, path, depth + 1);
        continue;
      }

      if (T === "FOR_EACH_OBJECT" && nested) {
        html += renderGroup(`${name}:`, depth);

        const entries = value && typeof value === "object" ? Object.entries(value) : [];
        for (const [k, v] of entries) {
          html += renderGroup(`${k}:`, depth + 1);
          html += walkSchema(v || {}, nested, `${path}.${k}`, depth + 2);
        }
        continue;
      }

      if (T === "FOR_EACH_ARRAY" && nested) {
        html += renderGroup(`${name}:`, depth);

        const entries = value && typeof value === "object" ? Object.entries(value) : [];
        for (const [k, arr] of entries) {
          html += renderGroup(`${k}:`, depth + 1);

          // If schema says “single string field array”, treat as leaf array
          const nestedFields = Object.values(nested);
          const isSingleString =
            nestedFields.length === 1 && String(nestedFields[0].type || "").toUpperCase() === "STRING";

          if (isSingleString) {
            html += renderLeaf({
              key: k,
              value: Array.isArray(arr) ? arr : [],
              path: `${path}.${k}`,
              type: "ARRAY",
              depth: depth + 2,
            });
          } else {
            // Array of objects: render each index as subgroup
            const safeArr = Array.isArray(arr) ? arr : [];
            safeArr.forEach((item, idx) => {
              html += renderGroup(`[${idx}]:`, depth + 2);
              html += walkSchema(item || {}, nested, `${path}.${k}.[${idx}]`, depth + 3);
            });
          }
        }
        continue;
      }

      // LEAF TYPES (STRING/ARRAY/etc)
      html += renderLeaf({
        key: name,
        value,
        path,
        type,
        depth,
      });
    }

    return html;
  }

  return walkSchema(tracker, schema, "", 0);
}



export function startOgAutoHideWatcher() {
  if (ogAppearObserver) return;

  ogAppearObserver = new MutationObserver(() => {
    if (!autoHideOgOnce) return;

    const og = document.querySelector("#trackerInterface");
    if (!og) return;

    // If it's visible, hide it once
    if (window.getComputedStyle(og).display !== "none") {
      hideOgTracker();
      autoHideOgOnce = false;
      console.log("[TrackerRevamp] OG auto-hidden once");
    }
  });

  ogAppearObserver.observe(document.body, { childList: true, subtree: true });
}

export function autoStartDockOnChat() {
  // Don’t spam open if user explicitly closed dock
  if (typeof userClosedDock !== "undefined" && userClosedDock) return;

  // Ensure dock toggle button exists (optional)
  ensureDockToggleButton?.();

  // Make sure dock is open
  startMirroringTrackerContents();
}

export function installOgTrackerCloseHijack() {
  if (ogHijackInstalled) return;
  ogHijackInstalled = true;

  // Capture-phase click handler so we can intercept before the original close handler runs
  document.addEventListener(
    "click",
    (e) => {
      const tracker = document.querySelector("#trackerInterface");
      if (!tracker) return;

      // Only care about clicks inside the OG tracker window
      if (!tracker.contains(e.target)) return;

      // Try to detect a "close" click
      const btn = e.target.closest("button, a, div, span");
      if (!btn) return;

      // Common cases: an X icon, × text, or anything labeled close
      const t = (btn.textContent || "").trim();
      const title = (btn.getAttribute("title") || "").toLowerCase();
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const cls = (btn.className || "").toString().toLowerCase();

      const looksLikeClose =
        t === "×" ||
        t === "x" ||
        title.includes("close") ||
        aria.includes("close") ||
        cls.includes("close") ||
        cls.includes("xmark") ||
        cls.includes("times");

      if (!looksLikeClose) return;

      // Hijack: prevent default close behavior and hide instead
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      hideOgTracker();
      console.log("[TrackerRevamp] OG tracker hidden (not destroyed)");
    },
    true
  ); // <-- capture = true
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function positionDockToggleButton() {
  if (!dockToggleBtn) return;

  dockToggleBtn.style.left = "";
  dockToggleBtn.style.right = "20px";
  dockToggleBtn.style.bottom = "20px";
  dockToggleBtn.style.zIndex = "10001";
}

function hideOgTracker() {
  const og = document.querySelector("#trackerInterface");
  if (!og) return false;

  // Store previous display so we can restore correctly
  const computed = window.getComputedStyle(og).display;
  if (computed && computed !== "none") {
    og.dataset.prevDisplay = computed;
  }

  og.style.display = "none";
  return true;
}

function showOgTracker() {
  const og = document.querySelector("#trackerInterface");
  if (!og) return false;

  // Restore previous display or fall back to block
  const prev = og.dataset.prevDisplay;
  og.style.display = prev && prev !== "none" ? prev : "block";

  // Make sure it’s not hiding behind your dock / UI
  og.style.zIndex = "9998";

  return true;
}

function ensureDockToggleButton() {
  if (dockToggleBtn) {
    dockToggleBtn.style.display = "block";
    positionDockToggleButton();
    return dockToggleBtn;
  }

  dockToggleBtn = document.createElement("button");
  dockToggleBtn.id = "trackerrevamp-dock-toggle";
  dockToggleBtn.className = "menu_button";
  dockToggleBtn.textContent = "📋 Tracker";
  dockToggleBtn.title = "Show Tracker Dock";

  dockToggleBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    padding: 8px 12px;
    border-radius: 999px;
  `;

  positionDockToggleButton();

  dockToggleBtn.addEventListener("click", () => {
    userClosedDock = false; // 👈 user wants it back
    clearRetryTimer(); // 👈 clear any stale retry loop
    startMirroringTrackerContents();
    dockToggleBtn.style.display = "none";
  });

  document.body.appendChild(dockToggleBtn);
  return dockToggleBtn;
}

export function ensureDock(side = "right") {
  currentDockSide = side;
  if (dockEl) return dockEl;

  dockEl = document.createElement("div");
  dockEl.id = "trackerrevamp-dock";
  dockEl.className = "trackerrevamp-dock";
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

  dockEl
    .querySelector("#trackerrevamp-dock-close")
    ?.addEventListener("click", () => {
      userClosedDock = true; // 👈 user explicitly closed it
      clearRetryTimer(); // 👈 stop any pending auto-reopen
      stopMirroring();

      dockEl.remove();
      dockEl = null;

      ensureDockToggleButton();
    });

  dockEl
    .querySelector("#trackerrevamp-dock-pin")
    ?.addEventListener("click", () => {
      const next = dockEl.dataset.side === "left" ? "right" : "left";
      dockEl.dataset.side = next;
      currentDockSide = next;

      dockEl.classList.toggle("is-left", next === "left");
      dockEl.classList.toggle("is-right", next === "right");

      positionDockToggleButton(); // 👈 add this
    });

  // initial side
  dockEl.classList.add(side === "left" ? "is-left" : "is-right");

  dockEl
    .querySelector("#trackerrevamp-og-toggle")
    ?.addEventListener("click", () => {
      const og = document.querySelector("#trackerInterface");
      if (!og) {
        console.warn("[TrackerRevamp] OG tracker not found (can’t toggle)");
        return;
      }

      const isHidden = window.getComputedStyle(og).display === "none";
      if (isHidden) showOgTracker();
      else hideOgTracker();
    });

  return dockEl;
}

function installDockEditing() {
  // click to start editing
  document.addEventListener("click", (e) => {
    const lineEl = e.target.closest(".tr-line");
    if (!lineEl) return;

    // Skip groups and plain lines
    if (lineEl.classList.contains("tr-group") || lineEl.classList.contains("tr-plain")) return;

    const editable = lineEl.querySelector(".tr-editable");
    if (!editable) return;

    // If another editor is open, commit it first
    if (activeEditor && activeEditor.editableEl !== editable) {
      commitActiveEditor();
    }

    // Already editing this one
    if (editable.dataset.editing === "1") return;

    const path = lineEl.dataset.path;
    const type = lineEl.dataset.type;
    const key = editable.dataset.key;
    const oldValue = editable.textContent;

    // ✅ create the input (textarea) again
    const input = document.createElement("textarea");
    input.className = "tr-input";
    input.value = oldValue;

    // make it visually seamless
    input.style.width = editable.offsetWidth + "px";
    input.style.height = editable.offsetHeight + "px";
    input.style.resize = "none";
    input.style.border = "none";
    input.style.outline = "none";
    input.style.padding = "0";
    input.style.margin = "0";
    input.style.background = "transparent";

    const cs = window.getComputedStyle(editable);
    input.style.fontSize = cs.fontSize;
    input.style.lineHeight = cs.lineHeight;
    input.style.fontFamily = cs.fontFamily;

    // mount it
    editable.dataset.editing = "1";
    editable.textContent = "";
    editable.appendChild(input);

    isDockEditing = true;
    activeEditor = { editableEl: editable, path, type, key, input, oldValue };

    input.focus();
    input.select();

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitActiveEditor();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancelActiveEditor();
      }
    });

    // no blur commit (good)
  }, true);

  // click outside commits
  document.addEventListener("mousedown", (e) => {
    if (!activeEditor) return;
    if (activeEditor.editableEl.contains(e.target)) return;
    commitActiveEditor();
  }, true);
}


function commitActiveEditor() {
  if (!activeEditor) return;

  const { editableEl, path, type, key, input } = activeEditor;

  // If the dock got rerendered, editableEl might be detached. Bail safely.
  if (!editableEl.isConnected) {
    activeEditor = null;
    isDockEditing = false;
    return;
  }

  const cleaned = normalizeEditedValue(key, input.value);

  editableEl.dataset.editing = "0";
  editableEl.innerHTML = escapeHtml(cleaned);

  // Write back to OG
  applyEditToTrackerPath(path, type, key, cleaned);

  console.log("[TrackerRevamp] Edited:", { path, key, newValue: cleaned });

  activeEditor = null;
  isDockEditing = false;
}

function cancelActiveEditor() {
  if (!activeEditor) return;

  const { editableEl, oldValue } = activeEditor;

  if (editableEl.isConnected) {
    editableEl.dataset.editing = "0";
    editableEl.innerHTML = escapeHtml(oldValue);
  }

  activeEditor = null;
  isDockEditing = false;
}


/**
 * Updates the OG tracker line text like "HP: 160/160".
 * We update by line index + key to be safe.
 */
function applyEditToTrackerPath(path, type, key, newValue) {
  const cleaned = normalizeEditedValue(key, newValue);
  const { ti, tracker } = getTrackerAndSchema();
  if (!ti || !tracker || !path) return;

  const coerced = coerceValueByType(type, cleaned);

  setValueAtPath(tracker, path, coerced);
  ti.onSave(tracker);

  // Optional: if OG tracker is open, you can refresh dock right after save
  // refreshDock();
}




installDockEditing();

function setDockHTML(html) {
  const body = dockEl?.querySelector("#trackerrevamp-dock-body");
  if (!body) return;

  body.innerHTML = html ?? "";

  // Cache last good content
  if (html && String(html).trim().length > 0) {
    lastKnownTrackerHTML = html;
  }
}

export function startMirroringTrackerContents() {
  ensureDock("left");
  if (dockToggleBtn) dockToggleBtn.style.display = "none";

  // immediate render
  refreshDock();

  // refresh loop (updates when tracker changes)
  if (dockRefreshTimer) clearInterval(dockRefreshTimer);
  dockRefreshTimer = setInterval(() => {
    if (!dockEl) return;
    if (userClosedDock) return;
    refreshDock();
  }, 400);

  console.log("[TrackerRevamp] Dock data rendering started");
}


export function stopMirroring() {
  if (dockRefreshTimer) {
    clearInterval(dockRefreshTimer);
    dockRefreshTimer = null;
  }
  isMirroringActive = false;
}
