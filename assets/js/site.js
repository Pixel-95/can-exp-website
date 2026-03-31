(() => {
  const accordions = document.querySelectorAll(".accordion");

  for (const accordion of accordions) {
    const header = accordion.querySelector(".accordion_header");
    const panel = accordion.querySelector(".accordion_panel");

    if (!header || !panel) {
      continue;
    }

    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-expanded", "false");

    if (!panel.id) {
      panel.id = `accordion-panel-${Math.random().toString(36).slice(2, 10)}`;
    }

    header.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-hidden", "true");

    const toggle = () => {
      const isOpen = accordion.classList.toggle("is-open");
      header.setAttribute("aria-expanded", String(isOpen));
      panel.setAttribute("aria-hidden", String(!isOpen));
    };

    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  }
})();
