() => {
  const addListener = (listeners, el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  };

  const setActivePanel = (root, type, name) => {
    const panels = root.querySelectorAll(`[data-panel^="${type}:"]`);
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === `${type}:${name}`);
    });
  };

  const clearPanels = (root, type) => {
    const panels = root.querySelectorAll(`[data-panel^="${type}:"]`);
    panels.forEach((panel) => panel.classList.remove("is-active"));
  };

  const init = ({ root } = {}) => {
    const scope = root || document.querySelector(".dock-sample");
    if (!scope) return;

    const listeners = [];
    scope.__dockFloaterListeners = listeners;
    const svgTargets = Array.from(scope.querySelectorAll("[data-svg]"));

    const mainButtons = Array.from(scope.querySelectorAll("[data-main-target]"));
    const otherToggle = scope.querySelector("[data-other-toggle]");
    const otherList = scope.querySelector("[data-other-list]");
    const otherButtons = Array.from(scope.querySelectorAll("[data-other-target]"));
    const smallToggle = scope.querySelector('[data-enemy-toggle="small"]');
    const bigToggle = scope.querySelector('[data-enemy-toggle="big"]');
    const smallPanel = scope.querySelector('[data-enemy-panel="small"]');
    const bigPanel = scope.querySelector('[data-enemy-panel="big"]');

    const isPlaceholderName = (value) => {
      const text = String(value || "").trim();
      if (!text) return true;
      const lowered = text.toLowerCase();
      if (lowered === "—" || lowered === "x" || lowered === "none" || lowered === "n/a") {
        return true;
      }
      return text.startsWith("<") && text.endsWith(">");
    };

    const hasNamedCards = (panel) => {
      if (!panel) return false;
      const cards = Array.from(panel.querySelectorAll(".dock-card"));
      if (cards.length === 0) return false;
      return cards.some((card) => {
        const nameEl = card.querySelector(".dock-name");
        return nameEl && !isPlaceholderName(nameEl.textContent);
      });
    };

    const applyInitial = (button) => {
      const label = button.getAttribute("title")
        || button.dataset.mainTarget
        || button.dataset.otherTarget
        || "";
      const trimmed = String(label).trim();
      if (!trimmed) return;
      button.textContent = trimmed[0].toUpperCase();
    };

    mainButtons.forEach((button) => {
      applyInitial(button);
      const label = button.getAttribute("title") || button.dataset.mainTarget || "";
      const name = String(label).trim().toLowerCase();
      const isJill = name.includes("jill");
      if (isJill) {
        button.style.setProperty("--rail-ring", "rgba(202, 106, 127, 0.72)");
        button.style.setProperty("--rail-core", "rgba(202, 106, 127, 0.28)");
        button.style.setProperty("--rail-ring-hover", "rgba(225, 135, 155, 0.95)");
        button.style.setProperty("--rail-core-hover", "rgba(225, 135, 155, 0.45)");
        button.style.setProperty("--rail-glow", "rgba(202, 106, 127, 0.55)");
      } else {
        button.style.setProperty("--rail-ring", "rgba(64, 160, 238, 0.72)");
        button.style.setProperty("--rail-core", "rgba(64, 160, 238, 0.28)");
        button.style.setProperty("--rail-ring-hover", "rgba(120, 190, 245, 0.95)");
        button.style.setProperty("--rail-core-hover", "rgba(120, 190, 245, 0.45)");
        button.style.setProperty("--rail-glow", "rgba(64, 160, 238, 0.55)");
      }
    });
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

    const otherBlock = otherToggle ? otherToggle.closest(".dock-rail-block") : null;
    const smallBlock = smallToggle ? smallToggle.closest(".dock-rail-block") : null;
    const bigBlock = bigToggle ? bigToggle.closest(".dock-rail-block") : null;

    const realOtherButtons = otherButtons.filter((button) => {
      const label = button.getAttribute("title") || button.dataset.otherTarget || "";
      return !isPlaceholderName(label);
    });

    if (realOtherButtons.length === 0 && otherBlock) {
      otherBlock.classList.add("is-hidden");
    }

    if (!hasNamedCards(smallPanel) && smallBlock) {
      smallBlock.classList.add("is-hidden");
    }

    if (!hasNamedCards(bigPanel) && bigBlock) {
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
        deactivateOtherButtons();
      }
    });

    const enemyClickHandler = (toggle, panel) => {
        deactivateMainButtons();
        deactivateOtherButtons();
        if (otherToggle) otherToggle.classList.remove("is-open");

        if (!panel) return;
        const nextState = !panel.classList.contains("is-open");
        panel.classList.toggle("is-open", nextState);
        toggle.classList.toggle("is-active", nextState);
    };

    addListener(listeners, smallToggle, "click", () => enemyClickHandler(smallToggle, smallPanel));
    addListener(listeners, bigToggle, "click", () => enemyClickHandler(bigToggle, bigPanel));

    if (mainButtons.length > 0) {
      mainButtons[0].click();
    } else if (otherButtons.length > 0) {
      otherButtons[0].click();
    }

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
  };

  const cleanup = () => {
    const scope = document.querySelector(".dock-sample");
    const listeners = scope ? scope.__dockFloaterListeners : null;
    if (!listeners) return;
    listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
    scope.__dockFloaterListeners = [];
  };

  return { init, cleanup };
}
