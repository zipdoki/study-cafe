const REPO = 'zipdoki/study-cafe';
const BRANCH = 'pages';
const BASE = 'https://api.github.com';

export const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

const shaCache = {};
let flatTree = [];

export function getToken() {
  return localStorage.getItem('sc-github-token') || null;
}

export function saveToken(token) {
  localStorage.setItem('sc-github-token', token);
}

export function clearToken() {
  localStorage.removeItem('sc-github-token');
}

function ghHeaders(token) {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function encPath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function b64decode(str) {
  const raw = atob(str.replace(/\n/g, ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildTree(items) {
  const map = {};
  const root = [];
  const neededDirs = new Set();

  for (const item of items) {
    if (item.type === 'blob' && item.path.endsWith('.md')) {
      if (item.sha) shaCache[item.path] = item.sha;
      const parts = item.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        neededDirs.add(parts.slice(0, i).join('/'));
      }
    }
  }

  for (const dirPath of neededDirs) {
    map[dirPath] = { name: dirPath.split('/').pop(), path: dirPath, type: 'dir', children: [] };
  }

  for (const item of items) {
    if (item.type === 'blob' && item.path.endsWith('.md')) {
      map[item.path] = { name: item.path.split('/').pop(), path: item.path, type: 'file' };
    }
  }

  for (const [p, node] of Object.entries(map)) {
    const parts = p.split('/');
    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      if (map[parentPath]) map[parentPath].children.push(node);
      else root.push(node);
    }
  }

  return sortTree(root);
}

function sortTree(items) {
  return items
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(item => item.type === 'dir' ? { ...item, children: sortTree(item.children) } : item);
}

function isLocal() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function flatAdd(path) {
  if (!flatTree.some(i => i.path === path)) {
    flatTree.push({ type: 'blob', path, sha: '' });
  }
}

function flatRemove(path) {
  flatTree = flatTree.filter(i => i.path !== path);
}

function flatRename(oldPath, newPath) {
  const item = flatTree.find(i => i.path === oldPath);
  if (item) item.path = newPath;
}

function collectFlatBlobs(nested) {
  const blobs = [];
  for (const item of nested) {
    if (item.type === 'file') blobs.push({ type: 'blob', path: item.path, sha: shaCache[item.path] || '' });
    else if (item.type === 'dir') blobs.push(...collectFlatBlobs(item.children || []));
  }
  return blobs;
}

async function saveTreeJson(token) {
  const nested = buildTree(flatTree.filter(i => i.path.endsWith('.md')));
  await saveFile('tree.json', JSON.stringify(nested), token);
}

export async function fetchTree() {
  if (isLocal()) {
    const res = await fetch('/api/tree');
    if (!res.ok) throw new Error('파일 목록 로드 실패');
    const data = await res.json();
    flatTree = data.tree || [];
    return buildTree(flatTree);
  }

  const res = await fetch(`${RAW_BASE}/tree.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('파일 목록 로드 실패');
  const data = await res.json();

  if (!data.length || data[0]?.type === 'blob') {
    flatTree = data;
    return buildTree(data);
  }

  // nested 포맷 (saveTreeJson이 저장한 형태)
  flatTree = collectFlatBlobs(data);
  return data;
}

export async function fetchFile(path) {
  const url = isLocal()
    ? `/api/file/${encPath(path)}`
    : `${RAW_BASE}/${encPath(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('파일 로드 실패');
  return res.text();
}

async function getSha(path, token) {
  if (shaCache[path]) return shaCache[path];
  const res = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) return null;
  const d = await res.json();
  shaCache[path] = d.sha;
  return d.sha;
}

export async function saveFile(path, content, token) {
  const sha = await getSha(path, token);
  const body = {
    message: sha ? `Update ${path}` : `Create ${path}`,
    content: b64encode(content),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '저장 실패');
  if (data.content?.sha) shaCache[path] = data.content.sha;
}

export async function createFile(path, token) {
  const res = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Create ${path}`, content: b64encode(''), branch: BRANCH }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '파일 생성 실패');
  if (data.content?.sha) shaCache[path] = data.content.sha;
  flatAdd(path);
  await saveTreeJson(token);
}

export async function deleteFile(path, token) {
  const sha = await getSha(path, token);
  if (!sha) throw new Error('파일을 찾을 수 없습니다');
  const res = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(path)}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Delete ${path}`, sha, branch: BRANCH }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '삭제 실패');
  delete shaCache[path];
  flatRemove(path);
  await saveTreeJson(token);
}

export async function renameFile(oldPath, newPath, token) {
  const res = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(oldPath)}?ref=${BRANCH}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) throw new Error('파일 읽기 실패');
  const old = await res.json();

  const createRes = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(newPath)}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rename ${oldPath} → ${newPath}`,
      content: old.content.replace(/\n/g, ''),
      branch: BRANCH,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData.message || '이름 변경 실패');
  if (createData.content?.sha) shaCache[newPath] = createData.content.sha;

  const delRes = await fetch(`${BASE}/repos/${REPO}/contents/${encPath(oldPath)}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Remove ${oldPath} (renamed)`, sha: old.sha, branch: BRANCH }),
  });
  if (!delRes.ok) throw new Error('이전 파일 삭제 실패');
  delete shaCache[oldPath];
  flatRename(oldPath, newPath);
  await saveTreeJson(token);
}

export async function uploadImage(base64Data, ext, token) {
  const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const filename = `${Date.now()}.${safeExt}`;
  const path = `images/${filename}`;
  const res = await fetch(`${BASE}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Add image ${path}`, content: base64Data, branch: BRANCH }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '이미지 업로드 실패');
  return path;
}
