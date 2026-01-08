(() => {
  const sidebar = document.getElementById('worker-sidebar');
  const dragHandle = document.getElementById('sidebar-drag-handle');
  const toggleBtn = document.getElementById('sidebar-toggle');
  
  if (!sidebar || !dragHandle || !toggleBtn) return;

  // 折叠/展开功能
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('collapsed');
    toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '+' : '−';
  });

  // 拖拽移动功能
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  const header = sidebar.querySelector('.worker-sidebar-header');
  
  header.addEventListener('mousedown', (e) => {
    if (e.target === toggleBtn) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = sidebar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    sidebar.style.position = 'fixed';
    sidebar.style.transition = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;
    
    // 限制在视口内
    const maxLeft = window.innerWidth - sidebar.offsetWidth;
    const maxTop = window.innerHeight - sidebar.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(20, Math.min(newTop, maxTop));
    
    sidebar.style.left = newLeft + 'px';
    sidebar.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      sidebar.style.transition = '';
      document.body.style.userSelect = '';
      // 保存位置到localStorage
      const pos = {
        left: sidebar.style.left,
        top: sidebar.style.top
      };
      localStorage.setItem('workerSidebarPosition', JSON.stringify(pos));
    }
  });

  // 调整宽度功能
  let isResizing = false;
  let startWidth, startResizeX;

  dragHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startResizeX = e.clientX;
    startWidth = sidebar.offsetWidth;
    sidebar.style.transition = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaX = e.clientX - startResizeX;
    let newWidth = startWidth + deltaX;
    newWidth = Math.max(200, Math.min(newWidth, 400));
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      sidebar.style.transition = '';
      document.body.style.userSelect = '';
      // 保存宽度到localStorage
      localStorage.setItem('workerSidebarWidth', sidebar.style.width);
    }
  });

  // 恢复保存的位置和宽度
  const savedPos = localStorage.getItem('workerSidebarPosition');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      if (pos.left) sidebar.style.left = pos.left;
      if (pos.top) sidebar.style.top = pos.top;
    } catch (e) {}
  }
  
  const savedWidth = localStorage.getItem('workerSidebarWidth');
  if (savedWidth) {
    sidebar.style.width = savedWidth;
  }
})();

