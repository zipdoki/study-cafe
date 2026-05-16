import { ICON } from './icons.js';

let dragSrc = null;

export function renderFileTree(items, container, onFileClick, activeFile, onMove, onDelete, onCreate, onRename, activeDirPath) {
  container.innerHTML = '';
  setupDropTarget(container, '', onMove, 'drag-over-root');

  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:12px 16px;font-size:13px;color:#aaa;';
    empty.textContent = '+ 버튼으로 파일을 만드세요';
    container.appendChild(empty);
    return;
  }

  renderItems(items, container, onFileClick, activeFile, onMove, onDelete, onCreate, onRename, activeDirPath);
}

function renderItems(items, container, onFileClick, activeFile, onMove, onDelete, onCreate, onRename, activeDirPath) {
  for (const item of items) {
    if (item.type === 'dir') {
      const block = document.createElement('div');
      block.className = 'tree-dir-block';

      const children = document.createElement('div');
      children.className = 'tree-children';
      renderItems(item.children, children, onFileClick, activeFile, onMove, onDelete, onCreate, onRename, activeDirPath);

      const header = document.createElement('div');
      header.className = `tree-item dir${item.path === activeDirPath ? ' active' : ''}`;
      header.dataset.dirPath = item.path;
      header.innerHTML = `${ICON.chevronDown}${ICON.folder}<span class="tree-label">${esc(item.name)}</span><button class="tree-add-btn" title="이 폴더에 파일 추가">+</button>`;
      setupDropTarget(header, item.path, onMove);

      let collapsed = false;

      function toggleCollapse() {
        collapsed = !collapsed;
        children.style.display = collapsed ? 'none' : '';
        const chevron = header.querySelector('.tree-chevron');
        if (chevron) chevron.outerHTML = collapsed ? ICON.chevronRight : ICON.chevronDown;
      }

      // Only the chevron toggles collapse; label/row click is handled by app.js
      header.addEventListener('click', (e) => {
        if (e.target.closest('.tree-chevron')) { toggleCollapse(); return; }
        if (e.target.closest('.tree-add-btn')) return;
        // Other clicks fall through to app.js fileTreeEl listener (dir view)
      });

      // Double-click label → rename
      header.querySelector('.tree-label').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(e.target, item.name, (newName) => onRename(item.path, newName, 'dir'));
      });

      header.querySelector('.tree-add-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapsed) {
          collapsed = false;
          children.style.display = '';
          header.querySelector('.tree-icon').textContent = '▾';
        }
        showInlineCreate(children, (name) => {
          const rel = name.endsWith('.md') ? name : name + '.md';
          onCreate(`${item.path}/${rel}`);
        });
      });

      block.appendChild(header);
      block.appendChild(children);
      container.appendChild(block);
    } else {
      const el = document.createElement('div');
      el.className = `tree-item file${item.path === activeFile ? ' active' : ''}`;
      el.dataset.path = item.path;
      el.draggable = true;
      el.innerHTML = `${ICON.file}<span class="tree-label">${esc(item.name)}</span><button class="tree-delete-btn" title="삭제">×</button>`;

      el.addEventListener('click', (e) => {
        if (e.target.closest('.tree-delete-btn')) return;
        onFileClick(item.path);
      });

      // Double-click label → rename
      el.querySelector('.tree-label').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(e.target, item.name, (newName) => onRename(item.path, newName, 'file'));
      });

      el.querySelector('.tree-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(item.path);
      });

      el.addEventListener('dragstart', (e) => {
        dragSrc = item.path;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.path);
        requestAnimationFrame(() => el.classList.add('dragging'));
      });

      el.addEventListener('dragend', () => {
        dragSrc = null;
        el.classList.remove('dragging');
        document.querySelectorAll('.drag-over, .drag-over-root')
          .forEach(n => n.classList.remove('drag-over', 'drag-over-root'));
      });

      container.appendChild(el);
    }
  }
}

// Inline rename: replaces label with input in-place
function startRename(labelEl, currentName, onConfirm) {
  if (labelEl.querySelector('input')) return; // already renaming

  const input = document.createElement('input');
  input.className = 'tree-rename-input';
  input.value = currentName;
  input.spellcheck = false;
  input.autocomplete = 'off';

  labelEl.textContent = '';
  labelEl.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    labelEl.textContent = val || currentName;
    if (val && val !== currentName) onConfirm(val);
  }

  function cancel() {
    if (committed) return;
    committed = true;
    labelEl.textContent = currentName;
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') cancel();
  });

  input.addEventListener('blur', () => setTimeout(commit, 100));
}

function setupDropTarget(el, targetDir, onMove, overClass = 'drag-over') {
  el.addEventListener('dragover', (e) => {
    if (!dragSrc) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add(overClass);
  });

  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove(overClass);
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove(overClass);
    const src = e.dataTransfer.getData('text/plain') || dragSrc;
    if (!src) return;
    const basename = src.split('/').pop();
    const dest = targetDir ? `${targetDir}/${basename}` : basename;
    if (dest !== src) onMove(src, dest);
  });
}

export function showInlineCreate(container, onConfirm) {
  const existing = container.querySelector('.tree-inline-wrapper');
  if (existing) { existing.remove(); return; }

  const wrapper = document.createElement('div');
  wrapper.className = 'tree-inline-wrapper';
  wrapper.innerHTML = ICON.file;

  const input = document.createElement('input');
  input.className = 'tree-inline-input';
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';

  wrapper.appendChild(input);
  container.insertBefore(wrapper, container.firstChild);
  input.focus();

  function confirm() {
    const val = input.value.trim();
    wrapper.remove();
    if (val) onConfirm(val);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') wrapper.remove();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { if (wrapper.isConnected) wrapper.remove(); }, 200);
  });
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
