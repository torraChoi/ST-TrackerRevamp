(() => {
  const addListener = (listeners, el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  };

  const setActivePanel = (root, type, name) => {
    const panels = root.querySelectorAll(`[data-panel^="${type}:"]`);
    panels.forEach((panel) => {
      panel.classList.toggle(
        "is-active",
        panel.dataset.panel === `${type}:${name}`
      );
    });
  };

  const clearPanels = (root, type) => {
    const panels = root.querySelectorAll(`[data-panel^="${type}:"]`);
    panels.forEach((panel) => panel.classList.remove("is-active"));
  };

  const init = ({ root, dockEl } = {}) => {
    const scope = root || document.querySelector(".dock-sample");
    if (!scope) return;

    const listeners = [];
    scope.__dockFloaterListeners = listeners;
    const svgTargets = Array.from(scope.querySelectorAll("[data-svg]"));
    const hostDock =
      dockEl ||
      scope.closest("#trackerrevamp-dock") ||
      document.querySelector("#trackerrevamp-dock");
    const dockRail = scope.querySelector(".dock-rail");
    const dockStage = scope.querySelector(".dock-stage");
    const dockBody =
      hostDock?.querySelector("#trackerrevamp-dock-body") || null;
    const trackerMeta =
      hostDock?.querySelector("[data-tracker-message]") ||
      document.querySelector("[data-tracker-message]");
    const trackerHeader = document.querySelector("#trackerInterfaceHeader");
    if (hostDock) {
      hostDock
        .querySelectorAll('[class*="dock-drawer-handle"]')
        .forEach((el) => el.remove());
    }

    const mainButtons = Array.from(
      scope.querySelectorAll("[data-main-target]")
    );
    const otherToggle = scope.querySelector("[data-other-toggle]");
    const otherList = scope.querySelector("[data-other-list]");
    const otherButtons = Array.from(
      scope.querySelectorAll("[data-other-target]")
    );
    const smallToggle = scope.querySelector('[data-enemy-toggle="small"]');
    const bigToggle = scope.querySelector('[data-enemy-toggle="big"]');
    const smallPanel = scope.querySelector('[data-enemy-panel="small"]');
    const bigPanel = scope.querySelector('[data-enemy-panel="big"]');
    const statBlocks = Array.from(scope.querySelectorAll(".dock-stats"));
    const tabGroups = Array.from(scope.querySelectorAll("[data-tabs]"));
    const regenButton = hostDock
      ? hostDock.querySelector('[data-dock-action="regenerate"]')
      : null;
    const regenIndicator = hostDock
      ? hostDock.querySelector('[data-dock-indicator="regen"]')
      : null;
    let regenStopTimer = null;

    const queueDrawerHandleSync = () => {};

    const ensureRegenIcon = () => {
      if (!regenButton) return;
      const existing = regenButton.querySelector(".regen-icon");
      if (existing) return;
      const text = regenButton.textContent || "";
      regenButton.textContent = "";
      const icon = document.createElement("span");
      icon.className = "regen-icon";
      icon.textContent = text.trim() || "⟳";
      regenButton.appendChild(icon);
    };

    const setRegenState = (isActive) => {
      if (!regenButton) return;
      regenButton.classList.toggle("is-regenerating", isActive);
      regenButton.setAttribute("aria-busy", isActive ? "true" : "false");
    };

    const stopRegen = () => {
      setRegenState(false);
      if (regenStopTimer) {
        clearTimeout(regenStopTimer);
        regenStopTimer = null;
      }
    };

    const indicatorLooksActive = () => {
      if (!regenIndicator) return false;
      const state = (regenIndicator.getAttribute("data-state") || "").toLowerCase();
      const busy = (regenIndicator.getAttribute("aria-busy") || "").toLowerCase();
      const cls = regenIndicator.classList;
      return (
        cls.contains("is-active") ||
        cls.contains("active") ||
        cls.contains("is-busy") ||
        cls.contains("busy") ||
        cls.contains("is-loading") ||
        state === "active" ||
        state === "busy" ||
        busy === "true"
      );
    };

    const addRemoveButtons = () => {
      scope
        .querySelectorAll(".dock-card-enemy, .dock-card-other")
        .forEach((card) => {
          if (card.querySelector(".dock-card-remove")) return;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dock-card-remove";
          btn.setAttribute("aria-label", "Remove card");
          btn.textContent = "×";
          card.appendChild(btn);
        });
    };

    const getEntryPathFromCard = (card) => {
      if (!card) return "";
      const line = card.querySelector("[data-path]");
      const path = line?.getAttribute("data-path") || "";
      const parts = path.split(".");
      if (parts.length < 2) return "";
      return `${parts[0]}.${parts[1]}`;
    };

    const getTrackerMessageLabel = () => {
      const raw = trackerHeader?.textContent || "";
      const match = String(raw).match(/message\s*(\d+)/i);
      if (!match) return "";
      return `#${match[1]}`;
    };

    const syncTrackerMeta = () => {
      if (!trackerMeta) return;
      const label = getTrackerMessageLabel();
      trackerMeta.textContent = label;
      trackerMeta.classList.toggle("is-hidden", !label);
    };

    const syncRegenFromIndicator = () => {
      if (!regenButton || !regenIndicator) return;
      if (indicatorLooksActive()) {
        setRegenState(true);
      } else {
        stopRegen();
      }
    };

    const applyInitial = (button) => {
      const label =
        button.getAttribute("title") ||
        button.dataset.mainTarget ||
        button.dataset.otherTarget ||
        "";
      const trimmed = String(label).trim();
      if (!trimmed) return;
      button.textContent = trimmed[0].toUpperCase();
    };

    mainButtons.forEach((button) => {
      applyInitial(button);
      const label =
        button.getAttribute("title") || button.dataset.mainTarget || "";
      const name = String(label).trim().toLowerCase();
      const isJill = name.includes("jill");
      if (isJill) {
        button.style.setProperty("--rail-ring", "rgba(202, 106, 127, 0.72)");
        button.style.setProperty("--rail-core", "rgba(196, 63, 132, 0.63)");
        button.style.setProperty(
          "--rail-ring-hover",
          "rgba(225, 135, 155, 0.95)"
        );
        button.style.setProperty(
          "--rail-core-hover",
          "rgb(255 123 152 / 63%)"
        );
        button.style.setProperty("--rail-glow", "rgba(202, 106, 127, 0.55)");
      } else {
        button.style.setProperty("--rail-ring", "rgba(64, 160, 238, 0.72)");
        button.style.setProperty("--rail-core", "rgba(74, 126, 238, 0.63)");
        button.style.setProperty(
          "--rail-ring-hover",
          "rgba(120, 190, 245, 0.95)"
        );
        button.style.setProperty(
          "--rail-core-hover",
          "rgb(95 183 255 / 74%)"
        );
        button.style.setProperty("--rail-glow", "rgba(64, 160, 238, 0.55)");
      }
    });

    const applyMainCharacterRoles = () => {
      const userName =
        typeof window?.name1 === "string" ? window.name1.trim() : "";
      const charName =
        typeof window?.characters?.[window?.this_chid]?.name === "string"
          ? window.characters[window.this_chid].name.trim()
          : "";

      const markRole = (el, name) => {
        if (!name) return;
        const normalized = String(name).trim().toLowerCase();
        if (userName && normalized === userName.toLowerCase()) {
          el.classList.add("is-user");
        }
        if (charName && normalized === charName.toLowerCase()) {
          el.classList.add("is-char");
        }
      };

      mainButtons.forEach((button) => {
        const label =
          button.getAttribute("title") || button.dataset.mainTarget || "";
        markRole(button, label);
      });

      scope
        .querySelectorAll(".dock-card-main[data-main-name]")
        .forEach((card) => {
          const label = card.getAttribute("data-main-name") || "";
          markRole(card, label);
        });
    };

    applyMainCharacterRoles();
    otherButtons.forEach((button) => {
      applyInitial(button);
      const hue = Math.floor(Math.random() * 360);
      const ring = `hsla(${hue}, 70%, 65%, 0.72)`;
      const ringHover = `hsla(${hue}, 80%, 75%, 0.9)`;
      const glow = `hsla(${hue}, 70%, 65%, 0.55)`;
      button.style.setProperty("--rail-ring", ring);
      button.style.setProperty("--rail-ring-hover", ringHover);
      button.style.setProperty("--rail-glow", glow);
    });

    if (otherToggle) {
      otherToggle.setAttribute("role", "button");
      otherToggle.setAttribute("tabindex", "0");
    }

    const otherBlock = otherToggle
      ? otherToggle.closest(".dock-rail-block")
      : null;
    const smallBlock = smallToggle
      ? smallToggle.closest(".dock-rail-block")
      : null;
    const bigBlock = bigToggle ? bigToggle.closest(".dock-rail-block") : null;

    const hasMeaningfulLabel = (text) => {
      const cleaned = String(text || "")
        .replace(/\(\s*off(?:-screen)?\s*\)/gi, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
      if (!cleaned) return false;
      if (cleaned === "—") return false;
      if (/^x$/i.test(cleaned)) return false;
      if (/^n\/?a$/i.test(cleaned)) return false;
      if (/^none$/i.test(cleaned)) return false;
      if (/^\{\{.*\}\}$/.test(cleaned)) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/character\s*name/i.test(cleaned)) return false;
      return true;
    };

    const otherPanel = scope.querySelector(
      '.dock-cards[data-panel-type="other"]'
    );
    const hasOtherEntriesFromButtons = otherButtons.some((button) => {
      const label =
        button.getAttribute("title") || button.dataset.otherTarget || "";
      return hasMeaningfulLabel(label);
    });
    const hasOtherEntriesFromCards = otherPanel
      ? Array.from(otherPanel.querySelectorAll(".dock-card .dock-name")).some(
          (node) => hasMeaningfulLabel(node.textContent)
        )
      : false;
    const hasOtherEntries =
      hasOtherEntriesFromButtons || hasOtherEntriesFromCards;

    if (!hasOtherEntries && otherBlock) {
      otherBlock.classList.add("is-hidden");
    }

    const hasEnemyEntries = (panel, nameSelector) => {
      if (!panel) return false;
      const cards = Array.from(panel.querySelectorAll(".dock-card"));
      return cards.some((card) => {
        const label = card.querySelector(nameSelector)?.textContent || "";
        return hasMeaningfulLabel(label);
      });
    };

    if (
      !hasEnemyEntries(
        smallPanel,
        ".dock-name, .dock-enemy-title, .small-name, .name"
      ) &&
      smallBlock
    ) {
      smallBlock.classList.add("is-hidden");
    }

    if (
      !hasEnemyEntries(
        bigPanel,
        ".dock-name, .dock-enemy-title, .quad-name, .dock-enemy-name, .name"
      ) &&
      bigBlock
    ) {
      bigBlock.classList.add("is-hidden");
    }

    if (smallPanel) smallPanel.classList.remove("is-open");
    if (bigPanel) bigPanel.classList.remove("is-open");
    if (otherToggle) otherToggle.classList.remove("is-open");

    const deactivateMainButtons = () => {
      mainButtons.forEach((btn) => btn.classList.remove("is-active"));
      clearPanels(scope, "main");
    };

    const deactivateOtherButtons = () => {
      otherButtons.forEach((btn) => btn.classList.remove("is-active"));
      if (otherToggle) otherToggle.classList.remove("is-active");
      clearPanels(scope, "other");
    };

    const deactivateEnemyButtons = () => {
      if (smallToggle) smallToggle.classList.remove("is-active");
      if (bigToggle) bigToggle.classList.remove("is-active");
      if (smallPanel) smallPanel.classList.remove("is-open");
      if (bigPanel) bigPanel.classList.remove("is-open");
    };

    const closeCards = (cards, onDone) => {
      const list = Array.from(cards || []);
      if (list.length === 0) {
        if (onDone) onDone();
        return;
      }
      list.forEach((card) => card.classList.add("is-closing"));
      setTimeout(() => {
        if (onDone) onDone();
        requestAnimationFrame(() => {
          list.forEach((card) => card.classList.remove("is-closing"));
        });
      }, 220);
    };

    mainButtons.forEach((button) => {
      addListener(listeners, button, "click", () => {
        if (button.classList.contains("is-active")) {
          const activeCards = scope.querySelectorAll(
            ".dock-card-main.is-active"
          );
          closeCards(activeCards, deactivateMainButtons);
          return;
        }
        deactivateEnemyButtons();
        deactivateMainButtons();
        deactivateOtherButtons();
        if (otherToggle) otherToggle.classList.remove("is-open");

        button.classList.add("is-active");
        setActivePanel(scope, "main", button.dataset.mainTarget);
      });
    });

    otherButtons.forEach((button) => {
      addListener(listeners, button, "click", (event) => {
        event.stopPropagation();
        if (button.classList.contains("is-active")) {
          const activeCards = scope.querySelectorAll(
            ".dock-card-other.is-active"
          );
          closeCards(activeCards, deactivateOtherButtons);
          return;
        }
        deactivateEnemyButtons();
        deactivateMainButtons();
        deactivateOtherButtons();

        button.classList.add("is-active");
        if (otherToggle) {
          otherToggle.classList.add("is-active");
          otherToggle.classList.add("is-open");
        }
        setActivePanel(scope, "other", button.dataset.otherTarget);
      });
    });

    addListener(listeners, otherToggle, "click", () => {
      const willBeOpen = !otherToggle.classList.contains("is-open");

      if (willBeOpen) {
        deactivateEnemyButtons();
        deactivateMainButtons();
        otherToggle.classList.add("is-open");

        if (otherButtons.length > 0) {
          otherButtons[0].click();
        }
      } else {
        otherToggle.classList.remove("is-open");
        const activeCards = scope.querySelectorAll(
          ".dock-card-other.is-active"
        );
        closeCards(activeCards, deactivateOtherButtons);
      }
    });

    const enemyClickHandler = (toggle, panel) => {
      deactivateMainButtons();
      deactivateOtherButtons();
      if (otherToggle) otherToggle.classList.remove("is-open");

      if (!panel) return;
      const nextState = !panel.classList.contains("is-open");
      if (nextState) {
        panel.classList.add("is-open");
        toggle.classList.add("is-active");
        return;
      }

      panel.classList.remove("is-open");
      toggle.classList.remove("is-active");
    };

    addListener(listeners, smallToggle, "click", () =>
      enemyClickHandler(smallToggle, smallPanel)
    );
    addListener(listeners, bigToggle, "click", () =>
      enemyClickHandler(bigToggle, bigPanel)
    );

    if (mainButtons.length > 0) {
      mainButtons[0].click();
    } else if (otherButtons.length > 0) {
      otherButtons[0].click();
    }

    if (regenButton) {
      ensureRegenIcon();
      addListener(listeners, regenButton, "click", () => {
        setRegenState(true);
        if (regenStopTimer) clearTimeout(regenStopTimer);
        regenStopTimer = setTimeout(stopRegen, 10000);
      });
    }

    if (regenIndicator) {
      const regenObserver = new MutationObserver(syncRegenFromIndicator);
      regenObserver.observe(regenIndicator, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      scope.__dockRegenObserver = regenObserver;
    }

    if (trackerHeader && trackerMeta) {
      syncTrackerMeta();
      const metaObserver = new MutationObserver(syncTrackerMeta);
      metaObserver.observe(trackerHeader, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      scope.__dockMetaObserver = metaObserver;
    }

    addRemoveButtons();
    addListener(listeners, scope, "click", (event) => {
      const btn = event.target.closest(".dock-card-remove");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const card = btn.closest(".dock-card");
      if (!card) return;
      const entryPath = getEntryPathFromCard(card);
      if (
        entryPath &&
        hostDock &&
        typeof hostDock.__removeTrackerEntry === "function"
      ) {
        hostDock.__removeTrackerEntry(entryPath);
      }
      const enemyBlock = card.closest(".dock-enemy-block");
      card.remove();
      if (!enemyBlock) return;
      if (enemyBlock.querySelectorAll(".dock-card").length > 0) return;
      enemyBlock.classList.remove("is-open");
      const panelName = enemyBlock.getAttribute("data-enemy-panel");
      if (!panelName) return;
      const toggle = scope.querySelector(
        `[data-enemy-toggle="${panelName}"]`
      );
      if (toggle) {
        toggle.classList.remove("is-active");
        const block = toggle.closest(".dock-rail-block");
        if (block) block.classList.add("is-hidden");
      }
    });

    const renderBarFromText = (el, kind) => {
      if (!el || el.__barized) return;
      const existingLine = el.querySelector(".tr-line");
      const lineText =
        existingLine?.querySelector(".tr-editable")?.textContent ||
        existingLine?.textContent ||
        "";
      const t = (el.dataset.raw || lineText || el.textContent || "").trim();
      const m = t.match(/(\d+)\s*\/\s*(\d+)/);
      if (!m) return;
      const cur = +m[1],
        max = +m[2];
      const pct = Math.max(0, Math.min(100, (cur / max) * 100));
      el.dataset.raw = t;
      el.textContent = "";
      const textWrap = document.createElement("div");
      textWrap.className = "labeltext";
      if (existingLine) {
        textWrap.appendChild(existingLine.cloneNode(true));
      } else {
        textWrap.textContent = t;
      }
      el.appendChild(textWrap);
      const bar = document.createElement("div");
      bar.className = "bar " + (kind === "hp" ? "hp" : "exp");
      const fill = document.createElement("span");
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      if (kind === "hp") {
        bar.classList.add(pct < 30 ? "bad" : pct < 60 ? "warn" : "ok");
      }
      el.appendChild(bar);
      el.__barized = true;
    };

    const initNumericBars = () => {
      scope
        .querySelectorAll(".hp-line")
        .forEach((el) => renderBarFromText(el, "hp"));
      scope
        .querySelectorAll(".exp-line")
        .forEach((el) => renderBarFromText(el, "exp"));
    };

    const splitPillText = (raw) => {
      const trimmed = String(raw || "").trim();
      if (!trimmed) return [];
      if (trimmed.includes("{{")) return [];
      const parts = trimmed.split(/\s*;\s*|\s*,\s*|\n+/);
      return parts.map((part) => part.trim()).filter(Boolean);
    };

    const renderPillList = (lineEl) => {
      if (!lineEl) return false;
      const key = lineEl.getAttribute("data-path") || "";
      const editable = lineEl.querySelector(".tr-editable");
      const raw = editable?.textContent || lineEl.textContent || "";
      const items = splitPillText(raw);
      if (items.length === 0) return false;

      const parent = lineEl.parentElement || lineEl;
      let list = parent.querySelector(
        `.dock-pill-list[data-pill-for="${key}"]`
      );
      if (!list) {
        list = document.createElement("div");
        list.className = "dock-pill-list";
        list.dataset.pillFor = key;
        list.addEventListener("click", () => {
          lineEl.classList.add("dock-pill-source--editing");
          lineEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          setTimeout(() => {
            const input = lineEl.querySelector(".tr-input");
            if (!input) return;
            const hide = () =>
              lineEl.classList.remove("dock-pill-source--editing");
            input.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter" || ev.key === "Escape") {
                setTimeout(hide, 0);
              }
            });
          }, 0);
        });
        parent.appendChild(list);
      }

      list.innerHTML = items
        .map((item) => `<span class="dock-pill-item">${item}</span>`)
        .join("");
      lineEl.classList.add("dock-pill-source");
      return true;
    };

    const initPillLists = () => {
      const sources = Array.from(scope.querySelectorAll("[data-pill-list]"));
      sources.forEach((lineEl) => {
        if (renderPillList(lineEl)) return;
        setTimeout(() => renderPillList(lineEl), 0);
        setTimeout(() => renderPillList(lineEl), 250);
      });
    };

    svgTargets.forEach((el) => {
      if (el.__svgApplied) return;
      const url = el.getAttribute("data-svg");
      if (!url) return;
      fetch(url)
        .then((res) => res.text())
        .then((text) => {
          if (text.trim().startsWith("<svg")) {
            el.innerHTML = text;
          } else {
            el.innerHTML = `<img src="${url}" alt="">`;
          }
          el.__svgApplied = true;
        })
        .catch(() => {
          el.innerHTML = `<img src="${url}" alt="">`;
          el.__svgApplied = true;
        });
    });

    initNumericBars();
    initPillLists();

    const parseStats = (text) => {
      const map = {};
      const regex = /\b(STR|END|AGI|DEX|INT|CHA|PER|LCK)\s*[:=]\s*(\d+)/gi;
      let match;
      while ((match = regex.exec(text || ""))) {
        map[match[1].toUpperCase()] = match[2];
      }
      return map;
    };

    const buildStatsString = (order, map) => {
      return order.map((key) => `${key}: ${map[key] || ""}`.trim()).join(" | ");
    };

    const commitTrLine = (lineEl, value) => {
      if (!lineEl) return;
      lineEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      setTimeout(() => {
        const input = lineEl.querySelector("textarea.tr-input");
        if (!input) return;
        input.value = value;
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
      }, 0);
    };

    statBlocks.forEach((block) => {
      const sourceLine = block.querySelector(".dock-stats-source");
      const pills = Array.from(block.querySelectorAll(".stat-pill"));
      const order = pills.map((pill) => pill.dataset.statKey);
      let map = {};

      const readSourceText = () => {
        const editable = sourceLine?.querySelector(".tr-editable");
        const raw = editable?.textContent || sourceLine?.textContent || "";
        return String(raw || "").trim();
      };

      const applyMapToPills = (nextMap) => {
        map = { ...nextMap };
        pills.forEach((pill) => {
          const key = pill.dataset.statKey;
          const valEl = pill.querySelector(".stat-val");
          if (!valEl) return;
          valEl.textContent = map[key] || "";
        });
      };

      const hydrateFromSource = () => {
        const raw = readSourceText();
        if (!raw || raw.includes("{{")) return false;
        const nextMap = parseStats(raw);
        if (Object.keys(nextMap).length === 0) return false;
        applyMapToPills(nextMap);
        return true;
      };

      if (!hydrateFromSource()) {
        setTimeout(() => hydrateFromSource(), 0);
        setTimeout(() => hydrateFromSource(), 250);
      }

      pills.forEach((pill) => {
        const key = pill.dataset.statKey;
        const valEl = pill.querySelector(".stat-val");
        if (!valEl) return;
        const update = () => {
          const next = String(valEl.textContent || "").replace(/[^0-9]/g, "");
          valEl.textContent = next;
          map[key] = next;
          const nextString = buildStatsString(order, map);
          commitTrLine(sourceLine, nextString);
        };
        valEl.addEventListener("blur", update);
        valEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            update();
            valEl.blur();
          }
        });
      });
    });

    tabGroups.forEach((group) => {
      const tabs = Array.from(group.querySelectorAll(".dock-tab"));
      if (tabs.length === 0) return;
      const card = group.closest(".dock-card");
      const panels = card
        ? Array.from(card.querySelectorAll(".dock-tab-panel"))
        : [];

      const ensurePanelPadding = (panel) => {
        if (!panel || panel.dataset.padTop) return;
        const style = getComputedStyle(panel);
        panel.dataset.padTop = style.paddingTop || "0px";
        panel.dataset.padRight = style.paddingRight || "0px";
        panel.dataset.padBottom = style.paddingBottom || "0px";
        panel.dataset.padLeft = style.paddingLeft || "0px";
      };

      const applyPanelPadding = (panel, useStored) => {
        if (!panel) return;
        if (useStored) {
          panel.style.paddingTop = panel.dataset.padTop || "";
          panel.style.paddingRight = panel.dataset.padRight || "";
          panel.style.paddingBottom = panel.dataset.padBottom || "";
          panel.style.paddingLeft = panel.dataset.padLeft || "";
        } else {
          panel.style.paddingTop = "0px";
          panel.style.paddingRight = "0px";
          panel.style.paddingBottom = "0px";
          panel.style.paddingLeft = "0px";
        }
      };

      const clearPanelPadding = (panel) => {
        if (!panel) return;
        panel.style.paddingTop = "";
        panel.style.paddingRight = "";
        panel.style.paddingBottom = "";
        panel.style.paddingLeft = "";
      };

      const openPanel = (panel) => {
        if (!panel) return;
        panel.style.display = "flex";
        panel.classList.add("is-active");
        ensurePanelPadding(panel);
        panel.style.overflow = "hidden";
        applyPanelPadding(panel, true);
        panel.style.height = "auto";
        const height = panel.scrollHeight;
        panel.style.height = "0px";
        panel.style.opacity = "0";
        panel.style.transform = "translateY(6px)";
        applyPanelPadding(panel, false);
        requestAnimationFrame(() => {
          panel.style.height = `${height}px`;
          panel.style.opacity = "1";
          panel.style.transform = "translateY(0)";
          applyPanelPadding(panel, true);
          panel.addEventListener(
            "transitionend",
            (event) => {
              if (event.propertyName !== "height") return;
              panel.style.height = "auto";
              panel.style.overflow = "";
              clearPanelPadding(panel);
            },
            { once: true }
          );
        });
      };

      const closePanel = (panel) => {
        if (!panel) return;
        ensurePanelPadding(panel);
        panel.style.overflow = "hidden";
        panel.style.height = `${panel.scrollHeight}px`;
        panel.style.opacity = "1";
        panel.style.transform = "translateY(0)";
        applyPanelPadding(panel, true);
        let closed = false;
        const finishClose = () => {
          if (closed) return;
          closed = true;
          panel.classList.remove("is-active");
          panel.style.display = "none";
          panel.style.height = "";
          panel.style.opacity = "";
          panel.style.transform = "";
          panel.style.overflow = "";
          clearPanelPadding(panel);
        };
        requestAnimationFrame(() => {
          panel.style.height = "0px";
          panel.style.opacity = "0";
          panel.style.transform = "translateY(6px)";
          applyPanelPadding(panel, false);
          panel.addEventListener(
            "transitionend",
            (event) => {
              if (event.propertyName !== "height") return;
              finishClose();
            },
            { once: true }
          );
          setTimeout(finishClose, 300);
        });
      };

      const immediateClosePanel = (panel) => {
        if (!panel) return;
        panel.classList.remove("is-active");
        panel.style.display = "none";
        panel.style.height = "";
        panel.style.opacity = "";
        panel.style.transform = "";
        panel.style.overflow = "";
        clearPanelPadding(panel);
      };

      const setActive = (name) => {
        tabs.forEach((tab) =>
          tab.classList.toggle("is-active", name && tab.dataset.tab === name)
        );
        panels.forEach((panel) => {
          const shouldOpen = name && panel.dataset.tabPanel === name;
          if (shouldOpen) {
            openPanel(panel);
          } else if (panel.classList.contains("is-active")) {
            if (name) {
              immediateClosePanel(panel);
            } else {
              closePanel(panel);
            }
          }
        });
      };

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const name = tab.dataset.tab;
          const isActive = tab.classList.contains("is-active");
          if (isActive) {
            setActive(null);
          } else {
            setActive(name);
          }
        });
      });
    });
  };

  const cleanup = () => {
    const scope = document.querySelector(".dock-sample");
    const listeners = scope ? scope.__dockFloaterListeners : null;
    if (!listeners) return;
    listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
    scope.__dockFloaterListeners = [];
    if (scope.__dockFloaterObserver) {
      scope.__dockFloaterObserver.disconnect();
      scope.__dockFloaterObserver = null;
    }
    if (scope.__dockMetaObserver) {
      scope.__dockMetaObserver.disconnect();
      scope.__dockMetaObserver = null;
    }
    if (scope.__dockRegenObserver) {
      scope.__dockRegenObserver.disconnect();
      scope.__dockRegenObserver = null;
    }
  };

  return { init, cleanup };
})();
