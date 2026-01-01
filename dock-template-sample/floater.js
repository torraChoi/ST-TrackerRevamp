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

    const otherBlock = otherToggle ? otherToggle.closest(".dock-rail-block") : null;
    const smallBlock = smallToggle ? smallToggle.closest(".dock-rail-block") : null;
    const bigBlock = bigToggle ? bigToggle.closest(".dock-rail-block") : null;

    if (otherButtons.length === 0 && otherBlock) {
      otherBlock.classList.add("is-hidden");
    }

    if (smallPanel && smallPanel.querySelectorAll(".dock-card").length === 0 && smallBlock) {
      smallBlock.classList.add("is-hidden");
    }

    if (bigPanel && bigPanel.querySelectorAll(".dock-card").length === 0 && bigBlock) {
      bigBlock.classList.add("is-hidden");
    }

    if (otherList) {
      otherList.classList.remove("is-open");
    }

    if (smallPanel) smallPanel.classList.remove("is-open");
    if (bigPanel) bigPanel.classList.remove("is-open");

    mainButtons.forEach((button) => {
      addListener(listeners, button, "click", () => {
        mainButtons.forEach((btn) => btn.classList.remove("is-active"));
        button.classList.add("is-active");
        setActivePanel(scope, "main", button.dataset.mainTarget);
        clearPanels(scope, "other");
      });
    });

    otherButtons.forEach((button) => {
      addListener(listeners, button, "click", () => {
        otherButtons.forEach((btn) => btn.classList.remove("is-active"));
        button.classList.add("is-active");
        setActivePanel(scope, "other", button.dataset.otherTarget);
        clearPanels(scope, "main");
      });
    });

    addListener(listeners, otherToggle, "click", () => {
      if (!otherList) return;
      otherList.classList.toggle("is-open");
      if (otherList.classList.contains("is-open") && otherButtons.length > 0) {
        const active = otherButtons.find((btn) => btn.classList.contains("is-active"));
        if (!active) otherButtons[0].click();
      }
    });

    addListener(listeners, smallToggle, "click", () => {
      if (!smallPanel) return;
      const nextState = !smallPanel.classList.contains("is-open");
      smallPanel.classList.toggle("is-open", nextState);
      smallToggle.classList.toggle("is-active", nextState);
    });

    addListener(listeners, bigToggle, "click", () => {
      if (!bigPanel) return;
      const nextState = !bigPanel.classList.contains("is-open");
      bigPanel.classList.toggle("is-open", nextState);
      bigToggle.classList.toggle("is-active", nextState);
    });

    if (mainButtons.length > 0) {
      mainButtons[0].click();
    } else if (otherButtons.length > 0) {
      otherButtons[0].click();
      if (otherList) otherList.classList.add("is-open");
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
