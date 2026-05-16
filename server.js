const express = require('express');
const simpleGit = require('simple-git');
const { spawnSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_DIR = __dirname;
const WORKTREE_DIR = path.join(__dirname, 'pages-worktree');

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Serve images uploaded to pages-worktree
app.use('/images', express.static(path.join(WORKTREE_DIR, 'images')));

const repoGit = simpleGit(REPO_DIR);

// --- Git Initialization ---

function createEmptyTreeSync() {
  const result = spawnSync('git', ['mktree'], {
    cwd: REPO_DIR,
    input: '',
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    // Well-known SHA for an empty tree in any git repo
    return '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }
  return result.stdout.trim();
}

async function initPagesWorktree() {
  // Already set up?
  try {
    await fs.access(path.join(WORKTREE_DIR, '.git'));
    console.log('✓ Pages worktree already initialized');
    return;
  } catch {}

  // Does pages branch exist?
  let pagesExists = false;
  try {
    await repoGit.raw(['rev-parse', '--verify', 'pages']);
    pagesExists = true;
  } catch {}

  if (!pagesExists) {
    console.log('Creating pages branch with initial empty commit...');
    const emptyTree = createEmptyTreeSync();
    const commitHash = (
      await repoGit.raw(['commit-tree', '-m', 'Initialize pages branch', emptyTree])
    ).trim();
    await repoGit.raw(['branch', 'pages', commitHash]);
    console.log('✓ Created pages branch');
  }

  await repoGit.raw(['worktree', 'add', WORKTREE_DIR, 'pages']);
  console.log('✓ Pages worktree added at', WORKTREE_DIR);
}

// --- Path Helpers ---

function resolveSafePath(rawPath) {
  if (!rawPath) throw new Error('Path is required');
  const clean = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(WORKTREE_DIR, clean);
  const base = WORKTREE_DIR + path.sep;
  if (!full.startsWith(base) && full !== WORKTREE_DIR) {
    throw new Error('Path traversal detected');
  }
  return full;
}

function toRelative(fullPath) {
  return path.relative(WORKTREE_DIR, fullPath);
}

// --- File Tree ---

async function buildTree(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const items = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'images') continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(WORKTREE_DIR, full);
    if (e.isDirectory()) {
      const children = await buildTree(full);
      items.push({ name: e.name, path: rel, type: 'dir', children });
    } else if (e.name.endsWith('.md')) {
      items.push({ name: e.name, path: rel, type: 'file' });
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// --- Push Helper ---

async function pushPages(wt) {
  try {
    await wt.raw(['push', '-u', 'origin', 'pages']);
    return { pushed: true };
  } catch (e) {
    return { pushed: false, pushError: e.message };
  }
}

// --- Routes ---

// GET /api/files  →  file tree JSON
app.get('/api/files', async (req, res) => {
  try {
    res.json(await buildTree(WORKTREE_DIR));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/*  →  file content
app.get('/api/files/*', async (req, res) => {
  try {
    const full = resolveSafePath(req.params[0]);
    const content = await fs.readFile(full, 'utf-8');
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// POST /api/files/*  →  create empty file
app.post('/api/files/*', async (req, res) => {
  try {
    const full = resolveSafePath(req.params[0]);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, '', { flag: 'wx' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'EEXIST') {
      res.status(409).json({ error: 'File already exists' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// PUT /api/files/*  →  save content + commit + push
app.put('/api/files/*', async (req, res) => {
  try {
    const full = resolveSafePath(req.params[0]);
    const rel = toRelative(full);
    const { content } = req.body;

    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');

    const wt = simpleGit(WORKTREE_DIR);
    await wt.add(rel);

    const status = await wt.status();
    if (status.staged.length > 0) {
      await wt.commit(`Update ${rel}`);
      const pushResult = await pushPages(wt);
      return res.json({ success: true, committed: true, ...pushResult });
    }

    res.json({ success: true, committed: false, pushed: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/files/*  →  rename/move file
app.patch('/api/files/*', async (req, res) => {
  try {
    const oldRel = req.params[0];
    const { newPath: newRel } = req.body;

    if (!newRel) return res.status(400).json({ error: 'newPath is required' });

    resolveSafePath(oldRel);
    const newFull = resolveSafePath(newRel);
    await fs.mkdir(path.dirname(newFull), { recursive: true });

    const wt = simpleGit(WORKTREE_DIR);
    await wt.raw(['mv', oldRel, newRel]);
    await wt.commit(`Rename ${oldRel} to ${newRel}`);
    const pushResult = await pushPages(wt);

    res.json({ success: true, newPath: newRel, ...pushResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/upload  →  save pasted image to pages-worktree/images/
app.post('/api/upload', async (req, res) => {
  try {
    const { data, ext } = req.body;
    if (!data) return res.status(400).json({ error: 'data is required' });

    const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const filename = `${Date.now()}.${safeExt}`;
    const imgRel = `images/${filename}`;
    const imagesDir = path.join(WORKTREE_DIR, 'images');
    const imgPath = path.join(imagesDir, filename);

    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(imgPath, Buffer.from(data, 'base64'));

    // Commit and push the image to pages branch
    const wt = simpleGit(WORKTREE_DIR);
    await wt.add(imgRel);
    const status = await wt.status();
    if (status.staged.length > 0) {
      await wt.commit(`Add image ${imgRel}`);
      await pushPages(wt);
    }

    res.json({ path: imgRel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/files/*  →  delete file + commit + push
app.delete('/api/files/*', async (req, res) => {
  try {
    const full = resolveSafePath(req.params[0]);
    const rel = toRelative(full);

    const wt = simpleGit(WORKTREE_DIR);
    const tracked = (await wt.raw(['ls-files', rel])).trim();

    if (tracked) {
      // git rm handles both fs deletion and index staging
      await wt.raw(['rm', rel]);
      await wt.commit(`Delete ${rel}`);
      const pushResult = await pushPages(wt);
      return res.json({ success: true, ...pushResult });
    } else {
      // Never committed — just remove from disk
      await fs.unlink(full);
      return res.json({ success: true, committed: false, pushed: false });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Catch-all: serve index.html for client-side routing (non-API, non-static)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---

async function start() {
  try {
    await initPagesWorktree();
    app.listen(PORT, () => {
      console.log(`\nStudy Cafe → http://localhost:${PORT}\n`);
    });
  } catch (e) {
    console.error('Startup failed:', e.message);
    process.exit(1);
  }
}

start();
