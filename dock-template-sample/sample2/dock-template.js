() => {
  const selectTab = (root, tabName) => {
    const tabs = root.querySelectorAll(".dock-tab");
    const panels = root.querySelectorAll("[data-tab-panel]");
    tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === tabName);
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.tabPanel === tabName);
    });
  };

  const init = () => {
    const root = document.querySelector(".dock-sample");
    if (!root) return;

    root.querySelectorAll(".dock-tab").forEach((tab) => {
      tab.addEventListener("click", () => selectTab(root, tab.dataset.tab));
    });

    selectTab(root, "main");
  };

  return { init };
};
