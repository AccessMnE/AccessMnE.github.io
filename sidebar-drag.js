(() => {
  const sidebar = document.getElementById("worker-sidebar");
  const dragHandle = document.getElementById("sidebar-drag-handle");
  const toggleBtn = document.getElementById("sidebar-toggle");

  if (!sidebar || !dragHandle || !toggleBtn) return;

  const MOBILE_MQ = window.matchMedia("(max-width: 1050px)");
  const MAX_DESKTOP_WIDTH = 280;

  function isMobileLayout() {
    return MOBILE_MQ.matches;
  }

  function clearInlinePlacement() {
    sidebar.style.left = "";
    sidebar.style.top = "";
    sidebar.style.bottom = "";
    sidebar.style.right = "";
    sidebar.style.width = "";
  }

  function clampDesktopWidth(px) {
    const n = parseInt(px, 10);
    if (!Number.isFinite(n)) return `${MAX_DESKTOP_WIDTH}px`;
    return `${Math.max(200, Math.min(MAX_DESKTOP_WIDTH, n))}px`;
  }

  // Collapse / expand
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("collapsed");
    toggleBtn.textContent = sidebar.classList.contains("collapsed") ? "+" : "−";
  });

  // Drag move (desktop only)
  let isDragging = false;
  let startX;
  let startY;
  let startLeft;
  let startTop;

  const header = sidebar.querySelector(".worker-sidebar-header");

  header.addEventListener("mousedown", (e) => {
    if (e.target === toggleBtn || isMobileLayout()) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = sidebar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    sidebar.style.position = "fixed";
    sidebar.style.transition = "none";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

    const maxLeft = Math.max(0, window.innerWidth - sidebar.offsetWidth);
    const maxTop = Math.max(20, window.innerHeight - sidebar.offsetHeight);
    // Keep sidebar in the left gutter so it does not cover Job Code column
    const gutterMax = 20;
    newLeft = Math.max(0, Math.min(newLeft, Math.min(maxLeft, gutterMax)));
    newTop = Math.max(20, Math.min(newTop, maxTop));

    sidebar.style.left = `${newLeft}px`;
    sidebar.style.top = `${newTop}px`;
    sidebar.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      sidebar.style.transition = "";
      document.body.style.userSelect = "";
      if (!isMobileLayout()) {
        localStorage.setItem(
          "workerSidebarPosition",
          JSON.stringify({
            left: sidebar.style.left,
            top: sidebar.style.top,
          })
        );
      }
    }
  });

  // Resize width (desktop only)
  let isResizing = false;
  let startWidth;
  let startResizeX;

  dragHandle.addEventListener("mousedown", (e) => {
    if (isMobileLayout()) return;
    isResizing = true;
    startResizeX = e.clientX;
    startWidth = sidebar.offsetWidth;
    sidebar.style.transition = "none";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const delta = e.clientX - startResizeX;
    const next = clampDesktopWidth(startWidth + delta);
    sidebar.style.width = next;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      sidebar.style.transition = "";
      document.body.style.userSelect = "";
      if (!isMobileLayout()) {
        localStorage.setItem("workerSidebarWidth", sidebar.style.width);
      }
    }
  });

  function applyResponsiveChrome() {
    if (isMobileLayout()) {
      // Let CSS bottom-dock win; ignore saved desktop placement
      clearInlinePlacement();
      return;
    }

    const savedPos = localStorage.getItem("workerSidebarPosition");
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        // Only restore if it stays in the left gutter (won't cover the board)
        const left = parseInt(pos.left, 10);
        if (Number.isFinite(left) && left <= 24) {
          sidebar.style.left = pos.left;
          if (pos.top) sidebar.style.top = pos.top;
        } else {
          clearInlinePlacement();
          localStorage.removeItem("workerSidebarPosition");
        }
      } catch (e) {
        /* ignore */
      }
    }

    const savedWidth = localStorage.getItem("workerSidebarWidth");
    if (savedWidth) {
      const clamped = clampDesktopWidth(savedWidth);
      sidebar.style.width = clamped;
      if (clamped !== savedWidth) {
        localStorage.setItem("workerSidebarWidth", clamped);
      }
    }
  }

  applyResponsiveChrome();
  MOBILE_MQ.addEventListener("change", applyResponsiveChrome);
})();
