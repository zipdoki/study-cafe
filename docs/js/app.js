import { initEditor, setContent, getMarkdown, focusEditor } from './editor.js';
import { renderFileTree, showInlineCreate } from './fileTree.js';
import { ICON } from './icons.js';
import { showConfirm, showAlert, showTokenInput } from './modal.js';
import {
  getToken, saveToken, clearToken,
  fetchTree, fetchFile,
  saveFile as ghSave,
  createFile as ghCreate,
  deleteFile as ghDelete,
  renameFile as ghRename,
  uploadImage as ghUpload,
  RAW_BASE,
} from './github.js';

const state = { currentFile: null, activeDir: null, isDirty: false };

const BASE = new URL(document.baseURI).pathname;
const $ = (id) => document.getElementById(id);
const fileTreeEl      = $('file-tree');
const pathDisplay     = $('file-path-display');
const pathInput       = $('file-path-input');
const statusText      = $('status-text');
const btnSave         = $('btn-save');
const btnNew          = $('btn-new-file');
btnNew.innerHTML      = ICON.plus;
const editorContainer = $('editor-container');
const dirView         = $('dir-view');
const dirFilesGrid    = $('dir-files-grid');

// ── Utilities ──────────────────────────────────────────────

function setStatus(msg, level = '') {
  statusText.textContent = msg;
  statusText.className = `status${level ? ' ' + level : ''}`;
}

function hhmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Token helpers ──────────────────────────────────────────

async function ensureToken() {
  let token = getToken();
  if (token) return token;
  token = await showTokenInput();
  if (!token) throw new Error('cancelled');
  saveToken(token);
  return token;
}

async function withToken(fn) {
  const token = await ensureToken();
  try {
    return await fn(token);
  } catch (e) {
    if (e.message?.includes('Bad credentials') || e.message?.includes('401')) {
      clearToken();
      throw new Error('토큰이 유효하지 않습니다. 다시 시도해 주세요.');
    }
    throw e;
  }
}

// ── File tree ──────────────────────────────────────────────

let fileTreeData = [];

async function refreshTree() {
  try {
    await ensureToken();
    fileTreeData = await fetchTree();
    renderFileTree(fileTreeData, fileTreeEl, openFile, state.currentFile, moveFile, deleteFile, doCreateFile, renameItem, state.activeDir);
  } catch (e) {
    if (e.message !== 'cancelled') console.error('Tree load failed:', e);
  }
}

function collectFilePaths(items) {
  const paths = [];
  for (const item of items) {
    if (item.type === 'file') paths.push(item.path);
    else if (item.children) paths.push(...collectFilePaths(item.children));
  }
  return paths;
}

// ── Open file ──────────────────────────────────────────────

async function openFile(filePath) {
  if (state.isDirty && state.currentFile) await saveFile();

  let content;
  try {
    await ensureToken();
    content = await fetchFile(filePath);
  } catch (e) {
    if (e.message === 'cancelled') return;
    setStatus('파일 열기 실패', 'error');
    return;
  }

  state.currentFile = filePath;
  state.activeDir = null;
  state.isDirty = false;

  setContent(content);

  editorContainer.style.display = '';
  dirView.style.display = 'none';

  pathDisplay.textContent = filePath;
  pathDisplay.classList.remove('placeholder');
  pathInput.style.display = 'none';
  pathDisplay.style.display = '';
  btnSave.disabled = false;
  setStatus('');

  history.pushState(null, '', BASE + filePath);

  renderFileTree(fileTreeData, fileTreeEl, openFile, state.currentFile, moveFile, deleteFile, doCreateFile, renameItem, state.activeDir);
  focusEditor();
}

// ── Save file ──────────────────────────────────────────────

async function saveFile() {
  if (!state.currentFile) return;

  setStatus('저장 중…');
  btnSave.disabled = true;

  try {
    const content = getMarkdown();
    await withToken((token) => ghSave(state.currentFile, content, token));
    state.isDirty = false;
    setStatus(`저장됨 ${hhmm()}`);
  } catch (e) {
    if (e.message !== 'cancelled') {
      setStatus(`저장 실패: ${e.message}`, 'error');
      console.error(e);
    } else {
      setStatus('');
    }
  }

  btnSave.disabled = false;
}

// ── Create file ────────────────────────────────────────────

async function doCreateFile(raw) {
  const filePath = raw.endsWith('.md') ? raw : raw + '.md';
  try {
    await withToken((token) => ghCreate(filePath, token));
    await refreshTree();
    await openFile(filePath);
  } catch (e) {
    if (e.message !== 'cancelled') setStatus(`파일 생성 실패: ${e.message}`, 'error');
  }
}

// ── Delete file ────────────────────────────────────────────

async function deleteFile(filePath) {
  const ok = await showConfirm(`"${filePath}" 을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, '파일 삭제');
  if (!ok) return;

  try {
    await withToken((token) => ghDelete(filePath, token));
    if (state.currentFile === filePath) {
      state.currentFile = null;
      state.isDirty = false;
      setContent('');
      pathDisplay.textContent = '파일을 선택하거나 + 로 생성하세요';
      pathDisplay.classList.add('placeholder');
      btnSave.disabled = true;
      setStatus('');
    }
    await refreshTree();
  } catch (e) {
    if (e.message !== 'cancelled') await showAlert(`삭제 실패: ${e.message}`, '오류');
  }
}

// ── Rename ─────────────────────────────────────────────────

async function renameItem(oldPath, newName, type) {
  const parts = oldPath.split('/');
  parts[parts.length - 1] = (type === 'file' && !newName.endsWith('.md'))
    ? newName + '.md'
    : newName;
  const newPath = parts.join('/');
  if (newPath === oldPath) return;

  try {
    if (type === 'dir') {
      const toMove = collectFilePaths(fileTreeData).filter(p => p.startsWith(oldPath + '/'));
      await withToken(async (token) => {
        for (const fp of toMove) {
          await ghRename(fp, fp.replace(oldPath + '/', newPath + '/'), token);
        }
      });
      if (state.currentFile?.startsWith(oldPath + '/')) {
        state.currentFile = state.currentFile.replace(oldPath + '/', newPath + '/');
        pathDisplay.textContent = state.currentFile;
      }
    } else {
      await withToken((token) => ghRename(oldPath, newPath, token));
      if (state.currentFile === oldPath) {
        state.currentFile = newPath;
        pathDisplay.textContent = state.currentFile;
      }
    }
    setStatus('이름 변경됨');
    await refreshTree();
  } catch (e) {
    if (e.message !== 'cancelled') {
      await showAlert(`이름 변경 실패: ${e.message}`, '오류');
      await refreshTree();
    }
  }
}

// ── Move (drag & drop) ─────────────────────────────────────

async function moveFile(oldPath, newPath) {
  try {
    await withToken((token) => ghRename(oldPath, newPath, token));
    if (state.currentFile === oldPath) {
      state.currentFile = newPath;
      pathDisplay.textContent = state.currentFile;
    }
    setStatus('이동됨');
    await refreshTree();
  } catch (e) {
    if (e.message !== 'cancelled') setStatus(`이동 실패: ${e.message}`, 'error');
  }
}

// ── Directory view ─────────────────────────────────────────

function findDirItems(tree, dirPath) {
  for (const item of tree) {
    if (item.type === 'dir') {
      if (item.path === dirPath) return item.children;
      const found = findDirItems(item.children, dirPath);
      if (found) return found;
    }
  }
  return null;
}

function renderDirGrid(items) {
  dirFilesGrid.innerHTML = '';
  if (!items || items.length === 0) {
    dirFilesGrid.innerHTML = '<div class="dir-empty">이 폴더는 비어 있습니다</div>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'dir-list-header';
  header.innerHTML = '<span>이름</span>';
  dirFilesGrid.appendChild(header);

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'dir-card';
    const typeLabel = item.type === 'dir' ? '폴더' : 'Markdown';
    row.innerHTML = `
      <span class="dir-card-icon">${item.type === 'dir' ? ICON.folder : ICON.file}</span>
      <span class="dir-card-name">${item.name}</span>
      <span class="dir-card-type">${typeLabel}</span>
    `;
    row.addEventListener('click', () => {
      if (item.type === 'dir') openDir(item.path);
      else openFile(item.path);
    });
    dirFilesGrid.appendChild(row);
  }
}

function showDirView(dirPath, items) {
  editorContainer.style.display = 'none';
  dirView.style.display = '';
  state.currentFile = null;
  btnSave.disabled = true;
  setStatus('');
  pathDisplay.textContent = dirPath ? dirPath + '/' : 'Pages';
  pathDisplay.classList.remove('placeholder');
  renderDirGrid(items);
}

function openDir(dirPath) {
  state.currentFile = null;
  state.activeDir = dirPath;
  const items = findDirItems(fileTreeData, dirPath);
  showDirView(dirPath, items || []);
  history.pushState(null, '', BASE + dirPath);
  renderFileTree(fileTreeData, fileTreeEl, openFile, state.currentFile, moveFile, deleteFile, doCreateFile, renameItem, state.activeDir);
}

function openRootDir() {
  state.activeDir = '';
  showDirView('', fileTreeData);
  history.pushState(null, '', BASE);
  renderFileTree(fileTreeData, fileTreeEl, openFile, state.currentFile, moveFile, deleteFile, doCreateFile, renameItem, state.activeDir);
}

fileTreeEl.addEventListener('click', (e) => {
  const header = e.target.closest('.tree-item.dir');
  if (!header || e.target.closest('.tree-add-btn')) return;
  const dirPath = header.dataset.dirPath;
  if (dirPath) openDir(dirPath);
});

// ── Rename via toolbar path ────────────────────────────────

async function renameFromPath(newRel) {
  if (!state.currentFile || !newRel || newRel === state.currentFile) {
    pathDisplay.textContent = state.currentFile || '';
    return;
  }
  const newPath = newRel.endsWith('.md') ? newRel : newRel + '.md';
  try {
    await withToken((token) => ghRename(state.currentFile, newPath, token));
    state.currentFile = newPath;
    pathDisplay.textContent = state.currentFile;
    setStatus('경로 변경됨');
    await refreshTree();
  } catch (e) {
    if (e.message !== 'cancelled') setStatus(`경로 변경 실패: ${e.message}`, 'error');
    pathDisplay.textContent = state.currentFile || '';
  }
}

// ── Path edit interactions ─────────────────────────────────

pathDisplay.addEventListener('dblclick', () => {
  if (!state.currentFile) return;
  pathInput.value = state.currentFile;
  pathDisplay.style.display = 'none';
  pathInput.style.display = '';
  pathInput.focus();
  pathInput.select();
});

pathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pathInput.blur();
  if (e.key === 'Escape') {
    pathInput.value = state.currentFile || '';
    pathInput.style.display = 'none';
    pathDisplay.style.display = '';
  }
});

pathInput.addEventListener('blur', async () => {
  const newPath = pathInput.value.trim();
  pathInput.style.display = 'none';
  pathDisplay.style.display = '';
  await renameFromPath(newPath);
});

// ── Keyboard shortcut ──────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
    e.preventDefault();
    if (!btnSave.disabled) saveFile();
  }
});

// ── Theme picker ───────────────────────────────────────────

const THEMES = [
  { id: 'default', label: '기본',     bg: '#fff',     fg: '#37352f' },
  { id: 'ocean',   label: '오션',     bg: '#e0f2fe',  fg: '#0080ff' },
  { id: 'forest',  label: '포레스트', bg: '#dcfce7',  fg: '#05A600FF' },
  { id: 'rose',    label: '로즈',     bg: '#ffe0da',  fg: '#ff2600' },
  { id: 'mono',    label: '모노',     bg: '#f5f5f5',  fg: '#000' },
];

const mainEl = $('main');
let currentTheme = localStorage.getItem('sc-theme') || 'default';

function applyTheme(id) {
  currentTheme = id;
  mainEl.dataset.theme = id === 'default' ? '' : id;
  localStorage.setItem('sc-theme', id);
}

applyTheme(currentTheme);

function buildThemePicker(anchorEl) {
  const existing = document.querySelector('.theme-picker');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.className = 'theme-picker';
  document.body.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'theme-picker-title';
  title.textContent = '테마 선택';
  panel.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'theme-picker-grid';
  panel.appendChild(grid);

  THEMES.forEach(({ id, label, bg, fg }) => {
    const opt = document.createElement('div');
    opt.className = 'theme-option' + (id === currentTheme ? ' active' : '');

    const swatch = document.createElement('div');
    swatch.className = 'theme-swatch';
    swatch.style.background = bg;
    swatch.style.color = fg;
    swatch.textContent = 'Aa';

    opt.appendChild(swatch);
    opt.addEventListener('click', () => {
      applyTheme(id);
      grid.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
    grid.appendChild(opt);
  });

  const rect = anchorEl.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 6) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';

  const close = (e) => {
    if (!panel.contains(e.target) && e.target !== anchorEl) {
      panel.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

// ── Button handlers ────────────────────────────────────────

document.querySelector('.app-identity').addEventListener('click', openRootDir);
btnSave.addEventListener('click', saveFile);
btnNew.addEventListener('click', () => showInlineCreate(fileTreeEl, doCreateFile));
$('btn-theme').addEventListener('click', (e) => buildThemePicker(e.currentTarget));

// ── Editor width toggle ─────────────────────────────────────

const btnWidth = $('btn-width');
if (localStorage.getItem('sc-wide') === 'true') editorContainer.classList.add('wide');

btnWidth.addEventListener('click', () => {
  const isWide = editorContainer.classList.toggle('wide');
  localStorage.setItem('sc-wide', isWide);
});

// ── URL navigation ────────────────────────────────────────

async function openFromHash() {
  const hash = decodeURIComponent(window.location.pathname.slice(BASE.length));
  await refreshTree();
  if (!hash) return;
  if (hash.endsWith('.md')) await openFile(hash);
  else openDir(hash);
}

window.addEventListener('popstate', () => {
  const hash = decodeURIComponent(window.location.pathname.slice(BASE.length));
  if (!hash) return;
  if (hash.endsWith('.md')) { if (hash !== state.currentFile) openFile(hash); }
  else openDir(hash);
});

// ── Sidebar resize & collapse ──────────────────────────────

const sidebarEl   = $('sidebar');
const resizerEl   = $('sidebar-resizer');
const appEl       = document.getElementById('app');
const btnCollapse = $('btn-collapse-sidebar');
btnCollapse.innerHTML = ICON.sidebarClose;

const savedSidebarWidth = localStorage.getItem('sc-sidebar-width');
if (savedSidebarWidth) {
  sidebarEl.style.width    = savedSidebarWidth + 'px';
  sidebarEl.style.minWidth = savedSidebarWidth + 'px';
}

if (localStorage.getItem('sc-sidebar-collapsed') === 'true') {
  appEl.classList.add('sidebar-collapsed');
  btnCollapse.innerHTML = ICON.sidebarOpen;
}

function setSidebarCollapsed(collapsed) {
  appEl.classList.toggle('sidebar-collapsed', collapsed);
  btnCollapse.innerHTML = collapsed ? ICON.sidebarOpen : ICON.sidebarClose;
  localStorage.setItem('sc-sidebar-collapsed', collapsed);
}

btnCollapse.addEventListener('click', () => {
  setSidebarCollapsed(!appEl.classList.contains('sidebar-collapsed'));
});

resizerEl.addEventListener('click', () => {
  if (appEl.classList.contains('sidebar-collapsed')) setSidebarCollapsed(false);
});

let isResizing = false, dragStartX = 0, dragStartWidth = 0;

resizerEl.addEventListener('mousedown', (e) => {
  if (appEl.classList.contains('sidebar-collapsed')) return;
  isResizing = true;
  dragStartX = e.clientX;
  dragStartWidth = sidebarEl.offsetWidth;
  resizerEl.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.max(160, Math.min(480, dragStartWidth + e.clientX - dragStartX));
  sidebarEl.style.width    = newWidth + 'px';
  sidebarEl.style.minWidth = newWidth + 'px';
  localStorage.setItem('sc-sidebar-width', newWidth);
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizerEl.classList.remove('dragging');
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});

// ── Circular favicon ───────────────────────────────────────

(function () {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, 64, 64);
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = c.toDataURL('image/png');
  };
  img.src = 'https://avatars.githubusercontent.com/u/112409928';
})();

// ── Init ───────────────────────────────────────────────────

initEditor(
  () => { if (state.currentFile) state.isDirty = true; },
  undefined,
  async (base64, ext) => {
    const token = await ensureToken();
    const imgPath = await ghUpload(base64, ext, token);
    return `${RAW_BASE}/${imgPath}`;
  },
);

openFromHash();
