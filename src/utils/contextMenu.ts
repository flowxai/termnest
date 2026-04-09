interface MenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

export function showContextMenu(x: number, y: number, items: MenuEntry[]) {
  // 关闭已有的右键菜单
  document.querySelectorAll('.ctx-menu').forEach((el) => el.remove());

  const menu = document.createElement('div');
  menu.className = 'fixed ctx-menu text-xs';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  items.forEach((entry) => {
    if ('separator' in entry) {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu-sep';
      menu.appendChild(sep);
      return;
    }
    const item = document.createElement('div');
    item.className = entry.danger ? 'ctx-menu-item danger' : 'ctx-menu-item';
    item.textContent = entry.label;
    item.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    item.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      // Delay the action until after the current click event finishes.
      // This avoids newly opened prompt overlays receiving the same click and closing immediately.
      requestAnimationFrame(() => entry.onClick());
    };
    menu.appendChild(item);
  });

  menu.onmousedown = (e) => {
    e.stopPropagation();
  };
  menu.onclick = (e) => {
    e.stopPropagation();
  };
  menu.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  document.body.appendChild(menu);

  const cleanup = (event?: Event) => {
    if (event?.target instanceof Node && menu.contains(event.target)) {
      return;
    }
    menu.remove();
    document.removeEventListener('mousedown', cleanup, true);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup(); };
  setTimeout(() => {
    document.addEventListener('mousedown', cleanup, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}
