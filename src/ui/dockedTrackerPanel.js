import { TrackerInterface } from './trackerInterface.js';
import { extensionSettings } from "../../index.js";
import { TrackerContentRenderer } from "./components/trackerContentRenderer.js";


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
let lastDockRenderFingerprint = "";
let dockRefreshQueued = false;
let dockRefreshSoonTimer = null;
let dockRefreshPendingAfterEdit = false;
let isDockRegenerating = false;
let groupToggleInstalled = false;
let groupToggleOverrides = new Map();
let dockTemplatePreview = null;
let dockTemplateStyleEl = null;
let dockTemplateScript = null;
let dockTemplateLastAssetsKey = "";
let dockTemplateRenderer = null;



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

  const template = getDockTemplateConfig();
  applyDockTemplateStyles(template);

  const renderKey = template ? `${template.html ?? ""}|${template.css ?? ""}|${template.js ?? ""}` : "";
  const fp = `${fingerprintTracker(tracker)}|${renderKey}`;
  if (fp === lastDockRenderFingerprint) return; // no change

  lastDockRenderFingerprint = fp;

  let html = "";
  if (template?.html) {
    html = renderDockFromTemplate(tracker, template);
  }
  if (!html) {
    html = renderDockFromTracker(tracker, schema);
  }

  setDockHTML(html);
  wireDockActionProxies();
  if (template?.html) {
    applyDockTemplateScript(template);
  }
}

function scheduleDockRefresh(reason = "manual") {
  if (!dockEl) return;

  if (isDockEditing) {
    // Defer until editing ends to avoid node detachment.
    dockRefreshPendingAfterEdit = true;
    return;
  }

  if (dockRefreshQueued) return;

  dockRefreshQueued = true;
  if (dockRefreshSoonTimer) clearTimeout(dockRefreshSoonTimer);

  dockRefreshSoonTimer = setTimeout(() => {
    dockRefreshQueued = false;
    dockRefreshSoonTimer = null;
    refreshDock();
  }, 50);
}

function flushPendingDockRefresh() {
  if (!dockRefreshPendingAfterEdit) return;
  dockRefreshPendingAfterEdit = false;
  scheduleDockRefresh("post-edit");
}

function setDockRegenerating(state) {
  isDockRegenerating = state;
  if (!dockEl) return;

  dockEl.classList.toggle("is-regenerating", state);

  const regenButtons = dockEl.querySelectorAll(
    "#trackerrevamp-dock-regenerate, [data-dock-action='regenerate']"
  );
  regenButtons.forEach((btn) => {
    btn.disabled = state;
  });

  const indicators = dockEl.querySelectorAll(
    "#trackerrevamp-dock-regen-indicator, [data-dock-indicator='regen']"
  );
  indicators.forEach((indicator) => {
    indicator.textContent = state ? "Regenerating..." : "";
  });

  if (state && activeEditor) {
    cancelActiveEditor();
  }
}

function wireDockActionProxies() {
  if (!dockEl) return;
  const header = dockEl.querySelector(".trackerrevamp-dock-header");
  const headerButtons = {
    regenerate: header?.querySelector("#trackerrevamp-dock-regenerate"),
    close: header?.querySelector("#trackerrevamp-dock-close"),
    "toggle-side": header?.querySelector("#trackerrevamp-dock-pin"),
    "toggle-og": header?.querySelector("#trackerrevamp-og-toggle"),
  };
  const actionHandlers = dockEl.__dockActions || {};

  dockEl.querySelectorAll("[data-dock-action]").forEach((button) => {
    if (button.dataset.dockActionBound === "1") return;
    const action = button.dataset.dockAction;
    const target = headerButtons[action];
    const handler = actionHandlers[action];
    if (!target && !handler) return;
    button.addEventListener("click", () => {
      if (typeof handler === "function") {
        handler();
      } else {
        performDockAction(action, target);
      }
    });
    button.dataset.dockActionBound = "1";
  });
}

function performDockAction(action, fallbackTarget) {
  if (!dockEl) return;
  if (action === "toggle-side") {
    const next = dockEl.dataset.side === "left" ? "right" : "left";
    dockEl.dataset.side = next;
    currentDockSide = next;

    dockEl.classList.toggle("is-left", next === "left");
    dockEl.classList.toggle("is-right", next === "right");

    positionDockToggleButton();
    return;
  }

  if (action === "toggle-og") {
    const og = document.querySelector("#trackerInterface");
    if (!og) {
      console.warn("[TrackerRevamp] OG tracker not found (can't toggle)");
      return;
    }

    const isHidden = window.getComputedStyle(og).display === "none";
    if (isHidden) showOgTracker();
    else hideOgTracker();
    return;
  }

  if (fallbackTarget) {
    fallbackTarget.click();
  }
}

function waitForOgRegenerationDone(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const og = document.querySelector("#trackerInterface");
    if (!og) return resolve();

    let done = false;
    let sawLoading = !!og.querySelector(".tracker-loading");

    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    };

    const observer = new MutationObserver(() => {
      const hasLoading = !!og.querySelector(".tracker-loading");
      if (hasLoading) sawLoading = true;
      if (sawLoading && !hasLoading) finish();
    });

    observer.observe(og, { childList: true, subtree: true });

    const timeout = setTimeout(finish, timeoutMs);

    if (!sawLoading) {
      setTimeout(() => {
        if (!sawLoading) finish();
      }, 1000);
    }
  });
}

function getDockTemplateConfig() {
  if (dockTemplatePreview) {
    return {
      enabled: true,
      html: dockTemplatePreview.html ?? "",
      css: dockTemplatePreview.css ?? "",
      js: dockTemplatePreview.js ?? "",
    };
  }

  if (!extensionSettings?.dockTemplateEnabled) return null;

  return {
    enabled: true,
    html: extensionSettings.dockTemplateHtml ?? "",
    css: extensionSettings.dockTemplateCss ?? "",
    js: extensionSettings.dockTemplateJs ?? "",
  };
}

function applyDockTemplateStyles(template) {
  const css = template?.css ?? "";
  const js = template?.js ?? "";
  const assetsKey = `${css}\n/*js*/\n${js}`;

  if (assetsKey === dockTemplateLastAssetsKey) return;
  dockTemplateLastAssetsKey = assetsKey;

  if (dockTemplateStyleEl) {
    dockTemplateStyleEl.remove();
    dockTemplateStyleEl = null;
  }
  if (css.trim()) {
    dockTemplateStyleEl = document.createElement("style");
    dockTemplateStyleEl.id = "trackerrevamp-dock-template-style";
    dockTemplateStyleEl.textContent = css;
    document.head.appendChild(dockTemplateStyleEl);
  }

  if (dockTemplateScript && typeof dockTemplateScript.cleanup === "function") {
    try {
      dockTemplateScript.cleanup();
    } catch (e) {
      console.warn("[TrackerRevamp] Dock template cleanup failed", e);
    }
  }
  dockTemplateScript = null;
}

function renderDockFromTemplate(tracker, template) {
  if (!template?.html || !String(template.html).trim()) return "";
  try {
    if (!dockTemplateRenderer) {
      dockTemplateRenderer = new TrackerContentRenderer();
    }
    return dockTemplateRenderer.renderFromTemplate(tracker, template.html);
  } catch (e) {
    console.warn("[TrackerRevamp] Dock template render failed, using default renderer", e);
    return "";
  }
}

function applyDockTemplateScript(template) {
  const js = template?.js ?? "";
  if (!js.trim()) {
    console.log("[TrackerRevamp] Dock template JS empty");
    return;
  }

  try {
    if (dockTemplateScript && typeof dockTemplateScript.cleanup === "function") {
      try {
        dockTemplateScript.cleanup();
      } catch (e) {
        console.warn("[TrackerRevamp] Dock template cleanup failed", e);
      }
    }

    const cleaned = js.trim().replace(/;+\s*$/, "");
    console.log("[TrackerRevamp] Dock template JS eval");
    let parsedFunction;
    try {
      parsedFunction = new Function(`return (${cleaned})`)();
    } catch (innerErr) {
      console.warn("[TrackerRevamp] Dock template JS eval fallback", innerErr);
      parsedFunction = new Function(`${cleaned}\n`)();
    }
    let parsedObject = parsedFunction;
    if (typeof parsedFunction === "function") parsedObject = parsedFunction();

    if (typeof parsedObject === "object" && parsedObject !== null) {
      dockTemplateScript = parsedObject;
      if (typeof dockTemplateScript.init === "function") {
        requestAnimationFrame(() => {
          const body = dockEl?.querySelector("#trackerrevamp-dock-body");
          const templateRoot = body?.querySelector(".dock-sample") || body || dockEl;
          console.log("[TrackerRevamp] Dock template JS init", { templateRoot, dockEl });
          try {
            dockTemplateScript.init({ root: templateRoot, dockEl });
          } catch {
            dockTemplateScript.init();
          }
        });
      }
    }
  } catch (e) {
    console.warn("[TrackerRevamp] Dock template JS failed to load", e);
  }
}

export function setDockTemplatePreview(preview) {
  dockTemplatePreview = preview;
  scheduleDockRefresh("dock-template-preview");
}

export function clearDockTemplatePreview() {
  dockTemplatePreview = null;
  scheduleDockRefresh("dock-template-preview-clear");
}

const hideEmptyGroupNames = new Set([
  "othercharacters",
  "smallenemies",
  "bigenemies",
]);

function normalizeGroupName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getPathTail(path) {
  if (!path) return "";
  const idx = path.lastIndexOf(".");
  return idx === -1 ? path : path.slice(idx + 1);
}

function getParentPath(path) {
  if (!path) return "";
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(0, idx);
}

function getGroupStorageKey(path) {
  return `trackerrevamp:groupCollapsed:${path}`;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getDefaultGroupCollapsed(path, name) {
  const normalized = normalizeGroupName(name);
  if (normalized === "maincharacters") return false;

  const parentName = normalizeGroupName(getPathTail(getParentPath(path)));
  if (parentName === "maincharacters") return true;

  return true;
}

function isPlaceholderEntryName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return true;
  if (trimmed.includes("{{") && trimmed.includes("}}")) return true;
  return false;
}

function isPlaceholderValue(value) {
  if (value == null) return true;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) return true;
    if (trimmed.includes("{{") && trimmed.includes("}}")) return true;
    return false;
  }

  if (Array.isArray(value)) {
    if (!value.length) return true;
    return value.every(isPlaceholderValue);
  }

  if (typeof value === "object") {
    const vals = Object.values(value);
    if (!vals.length) return true;
    return vals.every(isPlaceholderValue);
  }

  return false;
}

function isPlaceholderGroupEntry(name, value) {
  if (isPlaceholderEntryName(name)) return true;
  return isPlaceholderValue(value);
}

function getStoredGroupCollapsed(path, name) {
  if (groupToggleOverrides.has(path)) {
    return groupToggleOverrides.get(path);
  }
  return getDefaultGroupCollapsed(path, name);
}

function setStoredGroupCollapsed(path, collapsed) {
  groupToggleOverrides.set(path, collapsed);
}

function applyGroupCollapseVisibility() {
  const body = dockEl?.querySelector("#trackerrevamp-dock-body");
  if (!body) return;

  const lines = [...body.querySelectorAll(".tr-line")];
  const collapsedDepths = [];

  for (const line of lines) {
    const depth = Number(line.dataset.depth || 0);

    while (collapsedDepths.length && depth <= collapsedDepths[collapsedDepths.length - 1]) {
      collapsedDepths.pop();
    }

    const hidden = collapsedDepths.length > 0;
    line.classList.toggle("is-hidden", hidden);

    if (!hidden && line.classList.contains("tr-group")) {
      const path = line.dataset.groupPath || "";
      const name = line.dataset.groupName || "";
      const collapsed = getStoredGroupCollapsed(path, name);
      line.dataset.collapsed = collapsed ? "1" : "0";
      line.classList.toggle("is-collapsed", collapsed);

      if (collapsed) {
        collapsedDepths.push(depth);
      }
    }
  }
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

  function renderSectionHeader(title) {
    return `<div class="tr-section">${escapeHtml(title)}</div>`;
  }

  function renderGroup({ title, name, path, depth, hasChildren = true }) {
    return `
      <div class="tr-line tr-group" data-depth="${depth}" data-group-path="${escapeHtml(path)}" data-group-name="${escapeHtml(name)}" data-has-children="${hasChildren ? "1" : "0"}" style="padding-left:${depth * 12}px">
        <div class="tr-group-title">${escapeHtml(title)}</div>
      </div>
    `;
  }

  function renderLeaf({ key, value, path, type, depth }) {
    const display =
      Array.isArray(value) ? value.join("; ") :
      (value ?? "").toString();

    return `
      <div class="tr-line" data-path="${escapeHtml(path)}" data-type="${escapeHtml(type ?? "")}" data-depth="${depth}" style="padding-left:${depth * 12}px">
        <span class="tr-key">${escapeHtml(key)}:</span>
        <span class="tr-editable" data-key="${escapeHtml(key)}">${escapeHtml(display)}</span>
      </div>
    `;
  }

  function renderCategorySection(title, fieldSchema) {
    if (!fieldSchema) return "";

    const name = fieldSchema.name;
    const type = fieldSchema.type;
    const nested = fieldSchema.nestedFields;
    const path = name;
    const value = tracker?.[name];
    const T = String(type || "").toUpperCase();

    let html = "";

    if (T === "OBJECT" && nested) {
      html += walkSchema(value || {}, nested, path, 0);
    } else if (T === "FOR_EACH_OBJECT" && nested) {
      const entries = value && typeof value === "object" ? Object.entries(value) : [];
      const normalized = normalizeGroupName(name);
      const filteredEntries = hideEmptyGroupNames.has(normalized)
        ? entries.filter(([k, v]) => !isPlaceholderGroupEntry(k, v))
        : entries;
      if (!filteredEntries.length && hideEmptyGroupNames.has(normalized)) {
        return "";
      }

      for (const [k, v] of filteredEntries) {
        html += renderGroup({ title: `${k}:`, name: k, path: `${path}.${k}`, depth: 0 });
        html += walkSchema(v || {}, nested, `${path}.${k}`, 1);
      }
    } else if (T === "FOR_EACH_ARRAY" && nested) {
      const entries = value && typeof value === "object" ? Object.entries(value) : [];
      const normalized = normalizeGroupName(name);
      const filteredEntries = hideEmptyGroupNames.has(normalized)
        ? entries.filter(([k, v]) => !isPlaceholderGroupEntry(k, v))
        : entries;
      if (!filteredEntries.length && hideEmptyGroupNames.has(normalized)) {
        return "";
      }

      for (const [k, arr] of filteredEntries) {
        html += renderGroup({ title: `${k}:`, name: k, path: `${path}.${k}`, depth: 0 });

        const nestedFields = Object.values(nested);
        const isSingleString =
          nestedFields.length === 1 && String(nestedFields[0].type || "").toUpperCase() === "STRING";

        if (isSingleString) {
          html += renderLeaf({
            key: k,
            value: Array.isArray(arr) ? arr : [],
            path: `${path}.${k}`,
            type: "ARRAY",
            depth: 1,
          });
        } else {
          const safeArr = Array.isArray(arr) ? arr : [];
          safeArr.forEach((item, idx) => {
            const indexName = `[${idx}]`;
            html += renderGroup({
              title: `${indexName}:`,
              name: indexName,
              path: `${path}.${k}.${indexName}`,
              depth: 1,
            });
            html += walkSchema(item || {}, nested, `${path}.${k}.[${idx}]`, 2);
          });
        }
      }
    } else {
      html += renderLeaf({ key: name, value, path, type, depth: 0 });
    }

    if (!html) return "";
    return renderSectionHeader(title) + html;
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
        html += renderGroup({ title: `${name}:`, name, path, depth });
        html += walkSchema(value || {}, nested, path, depth + 1);
        continue;
      }

      if (T === "FOR_EACH_OBJECT" && nested) {
        const entries = value && typeof value === "object" ? Object.entries(value) : [];
        const normalized = normalizeGroupName(name);
        const filteredEntries = hideEmptyGroupNames.has(normalized)
          ? entries.filter(([k, v]) => !isPlaceholderGroupEntry(k, v))
          : entries;
        if (!filteredEntries.length && hideEmptyGroupNames.has(normalized)) {
          continue;
        }

        html += renderGroup({
          title: `${name}:`,
          name,
          path,
          depth,
          hasChildren: filteredEntries.length > 0,
        });

        for (const [k, v] of filteredEntries) {
          html += renderGroup({ title: `${k}:`, name: k, path: `${path}.${k}`, depth: depth + 1 });
          html += walkSchema(v || {}, nested, `${path}.${k}`, depth + 2);
        }
        continue;
      }

      if (T === "FOR_EACH_ARRAY" && nested) {
        const entries = value && typeof value === "object" ? Object.entries(value) : [];
        const normalized = normalizeGroupName(name);
        const filteredEntries = hideEmptyGroupNames.has(normalized)
          ? entries.filter(([k, v]) => !isPlaceholderGroupEntry(k, v))
          : entries;
        if (!filteredEntries.length && hideEmptyGroupNames.has(normalized)) {
          continue;
        }

        html += renderGroup({
          title: `${name}:`,
          name,
          path,
          depth,
          hasChildren: filteredEntries.length > 0,
        });

        for (const [k, arr] of filteredEntries) {
          html += renderGroup({ title: `${k}:`, name: k, path: `${path}.${k}`, depth: depth + 1 });

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
              const indexName = `[${idx}]`;
              html += renderGroup({
                title: `${indexName}:`,
                name: indexName,
                path: `${path}.${k}.${indexName}`,
                depth: depth + 2,
              });
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

  const schemaFields = Object.values(schema);
  const schemaByName = new Map(schemaFields.map((field) => [field.name, field]));
  const categoryOrder = [
    { name: "MainCharacters", title: "Main Characters" },
    { name: "OtherCharacters", title: "Other Characters" },
    { name: "SmallEnemies", title: "Small Enemies" },
    { name: "BigEnemies", title: "Big Enemies" },
  ];

  let html = "";
  const used = new Set();
  const categoryNames = new Set(categoryOrder.map((cat) => cat.name));

  const generalFields = schemaFields.filter((field) => !categoryNames.has(field.name));
  if (generalFields.length) {
    const generalNode = {};
    generalFields.forEach((field, idx) => {
      generalNode[`field-${idx}`] = field;
    });
    html += renderSectionHeader("General");
    html += walkSchema(tracker, generalNode, "", 0);
  }

  for (const cat of categoryOrder) {
    const fieldSchema = schemaByName.get(cat.name);
    const section = renderCategorySection(cat.title, fieldSchema);
    if (section) {
      html += section;
      used.add(cat.name);
    }
  }

  return html;
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
  lastDockRenderFingerprint = "";

  dockEl.innerHTML = `
    <div class="trackerrevamp-dock-header">
      <span class="trackerrevamp-dock-title">Tracker</span>
      <div class="trackerrevamp-dock-actions">
        <span id="trackerrevamp-dock-regen-indicator" class="trackerrevamp-dock-regen-indicator"></span>
        <button id="trackerrevamp-dock-regenerate" class="menu_button" title="Regenerate tracker">⟳</button>
        <button id="trackerrevamp-og-toggle" class="menu_button" title="Show/Hide OG tracker">🛠</button>
        <button id="trackerrevamp-dock-pin" class="menu_button" title="Toggle side">⇄</button>
        <button id="trackerrevamp-dock-close" class="menu_button" title="Close">×</button>
      </div>
    </div>
    <div id="trackerrevamp-dock-body" class="trackerrevamp-dock-body"></div>
  `;

  document.body.appendChild(dockEl);

  dockEl.addEventListener("click", (event) => {
    let actionBtn = null;
    let node = event.target;
    while (node && node !== dockEl) {
      if (node.dataset && node.dataset.dockAction) {
        actionBtn = node;
        break;
      }
      node = node.parentElement;
    }
    if (!actionBtn) return;
    const action = actionBtn.dataset.dockAction;
    if (action === "toggle-side" || action === "toggle-og") {
      event.preventDefault();
      performDockAction(action);
      return;
    }
    const map = {
      regenerate: "#trackerrevamp-dock-regenerate",
      "toggle-og": "#trackerrevamp-og-toggle",
      "toggle-side": "#trackerrevamp-dock-pin",
      close: "#trackerrevamp-dock-close",
    };
    const selector = map[action];
    const target = selector ? dockEl.querySelector(selector) : null;
    if (!target) return;
    event.preventDefault();
    target.click();
  });

  dockEl
    .querySelector("#trackerrevamp-dock-close")
    ?.addEventListener("click", () => {
      userClosedDock = true; // 👈 user explicitly closed it
      clearRetryTimer(); // 👈 stop any pending auto-reopen
      stopMirroring();

      dockEl.remove();
      dockEl = null;
      lastDockRenderFingerprint = "";

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

  dockEl
    .querySelector("#trackerrevamp-dock-regenerate")
    ?.addEventListener("click", async () => {
      if (isDockRegenerating) return;

      setDockRegenerating(true);
      try {
        const ti = TrackerInterface?.instance;
        if (ti?.regenerateTracker) {
          await Promise.resolve(ti.regenerateTracker());
          return;
        }

        const regenBtn = document.querySelector("#trackerInterfaceRegenerateTracker");
        if (regenBtn) {
          regenBtn.click();
          await waitForOgRegenerationDone();
          return;
        }

        console.warn("[TrackerRevamp] Regenerate action not available");
      } finally {
        setDockRegenerating(false);
      }
    });

  return dockEl;
}

function installDockEditing() {
  // click to start editing
  document.addEventListener("click", (e) => {
    if (isDockRegenerating) return;

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

function installDockGroupToggles() {
  if (groupToggleInstalled) return;
  groupToggleInstalled = true;

  document.addEventListener("click", (e) => {
    if (isDockRegenerating) return;

    const groupEl = e.target.closest(".tr-group");
    if (!groupEl) return;
    if (!dockEl || !dockEl.contains(groupEl)) return;

    const path = groupEl.dataset.groupPath;
    if (!path) return;

    const collapsed = groupEl.dataset.collapsed === "1";
    setStoredGroupCollapsed(path, !collapsed);
    applyGroupCollapseVisibility();
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
  flushPendingDockRefresh();
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
  flushPendingDockRefresh();
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
  scheduleDockRefresh("save");

  // Optional: if OG tracker is open, you can refresh dock right after save
  // refreshDock();
}




installDockEditing();
installDockGroupToggles();

function setDockHTML(html) {
  const body = dockEl?.querySelector("#trackerrevamp-dock-body");
  if (!body) return;

  body.innerHTML = html ?? "";
  applyGroupCollapseVisibility();

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
