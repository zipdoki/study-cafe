const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'pages-worktree');
const OUT = path.join(CONTENT_DIR, 'tree.json');

function collect(dir, root) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (entry.isDirectory()) {
      results.push(...collect(abs, root));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push({ type: 'blob', path: rel, sha: '' });
    }
  }
  return results;
}

const items = collect(CONTENT_DIR, CONTENT_DIR);
fs.writeFileSync(OUT, JSON.stringify(items));
console.log(`tree.json 생성 완료: ${items.length}개 파일`);
items.forEach(i => console.log(' ', i.path));
