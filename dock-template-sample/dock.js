() => {
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

  const init = ({ root } = {}) => {
    const scope = root || document.querySelector(".dock-sample");
    if (!scope) return;

    const hostDock =
      scope.closest("#trackerrevamp-dock") ||
      document.querySelector("#trackerrevamp-dock");

    const expandDrawer = () => {
      if (hostDock && hostDock.classList.contains("is-collapsed")) {
        hostDock.classList.remove("is-collapsed");
      }
    };

    const listeners = [];
    scope.__dockFloaterListeners = listeners;
    const svgTargets = Array.from(scope.querySelectorAll("[data-svg]"));

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
        button.style.setProperty("--rail-core", "rgba(202, 106, 127, 0.28)");
        button.style.setProperty(
          "--rail-ring-hover",
          "rgba(225, 135, 155, 0.95)"
        );
        button.style.setProperty(
          "--rail-core-hover",
          "rgba(225, 135, 155, 0.45)"
        );
        button.style.setProperty("--rail-glow", "rgba(202, 106, 127, 0.55)");
      } else {
        button.style.setProperty("--rail-ring", "rgba(64, 160, 238, 0.72)");
        button.style.setProperty("--rail-core", "rgba(64, 160, 238, 0.28)");
        button.style.setProperty(
          "--rail-ring-hover",
          "rgba(120, 190, 245, 0.95)"
        );
        button.style.setProperty(
          "--rail-core-hover",
          "rgba(120, 190, 245, 0.45)"
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
        ".dock-name, .dock-enemy-title, .quad-name, .name"
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

    mainButtons.forEach((button) => {
      addListener(listeners, button, "click", () => {
        expandDrawer();
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
        expandDrawer();
        event.stopPropagation();
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
        expandDrawer();
        deactivateEnemyButtons();
        deactivateMainButtons();
        otherToggle.classList.add("is-open");

        if (otherButtons.length > 0) {
          otherButtons[0].click();
        }
      } else {
        otherToggle.classList.remove("is-open");
        deactivateOtherButtons();
      }
    });

    const enemyClickHandler = (toggle, panel) => {
      expandDrawer();
      deactivateMainButtons();
      deactivateOtherButtons();
      if (otherToggle) otherToggle.classList.remove("is-open");

      if (!panel) return;
      const nextState = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", nextState);
      toggle.classList.toggle("is-active", nextState);
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

    const renderBarFromText = (el, kind) => {
      if (!el || el.__barized) return;
      const t = (el.dataset.raw || el.textContent || "").trim();
      const m = t.match(/(\d+)\s*\/\s*(\d+)/);
      if (!m) return;
      const cur = +m[1],
        max = +m[2];
      const pct = Math.max(0, Math.min(100, (cur / max) * 100));
      el.dataset.raw = t;
      el.innerHTML = `<div class="labeltext">${t}</div>`;
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
      const setActive = (name) => {
        tabs.forEach((tab) =>
          tab.classList.toggle("is-active", name && tab.dataset.tab === name)
        );
        panels.forEach((panel) =>
          panel.classList.toggle(
            "is-active",
            name && panel.dataset.tabPanel === name
          )
        );
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
  };

  return { init, cleanup };
};
