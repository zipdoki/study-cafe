import { Editor, Node, Extension, InputRule, mergeAttributes } from 'https://esm.sh/@tiptap/core@2';
import Suggestion from 'https://esm.sh/@tiptap/suggestion@2';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2';
import Image from 'https://esm.sh/@tiptap/extension-image@2';
import CodeBlockLowlight from 'https://esm.sh/@tiptap/extension-code-block-lowlight@2';
import { lowlight } from 'https://esm.sh/lowlight@2';
import { Plugin } from 'https://esm.sh/prosemirror-state@1';
import Table from 'https://esm.sh/@tiptap/extension-table@2';
import TableRow from 'https://esm.sh/@tiptap/extension-table-row@2';
import TableHeader from 'https://esm.sh/@tiptap/extension-table-header@2';
import TableCell from 'https://esm.sh/@tiptap/extension-table-cell@2';
import { TableUI } from './tableUI.js';

const LANGUAGES = [
  { value: '',           label: '언어 없음' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python',     label: 'Python' },
  { value: 'java',       label: 'Java' },
  { value: 'scala',      label: 'Scala' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
  { value: 'json',       label: 'JSON' },
  { value: 'yaml',       label: 'YAML' },
  { value: 'bash',       label: 'Bash' },
  { value: 'sql',        label: 'SQL' },
  { value: 'html',       label: 'HTML' },
  { value: 'css',        label: 'CSS' },
  { value: 'markdown',   label: 'Markdown' },
];

function getLangLabel(value) {
  return LANGUAGES.find(l => l.value === value)?.label ?? (value || '언어 없음');
}

// ── Custom language dropdown (appended to body to escape overflow clipping) ──

function buildLangDropdown(btn, currentLang, onSelect) {
  const dropdown = document.createElement('div');
  dropdown.className = 'code-lang-dropdown';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  LANGUAGES.forEach(({ value, label }) => {
    const item = document.createElement('div');
    item.className = 'code-lang-option' + (value === currentLang ? ' selected' : '');
    item.textContent = label;

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.querySelectorAll('.code-lang-option').forEach(o => o.classList.remove('selected'));
      item.classList.add('selected');
      btn.textContent = getLangLabel(value) + ' ▾';
      closeDropdown();
      onSelect(value);
    });

    dropdown.appendChild(item);
  });

  function openDropdown() {
    const rect = btn.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.display = 'block';
  }

  function closeDropdown() {
    dropdown.style.display = 'none';
  }

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdown.style.display !== 'none' ? closeDropdown() : openDropdown();
  });

  const outsideHandler = (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
  };
  document.addEventListener('mousedown', outsideHandler);

  const destroy = () => {
    dropdown.remove();
    document.removeEventListener('mousedown', outsideHandler);
  };

  return { dropdown, destroy, updateSelection(lang) {
    dropdown.querySelectorAll('.code-lang-option').forEach(o => o.classList.remove('selected'));
    const match = [...dropdown.querySelectorAll('.code-lang-option')]
      .find(o => o.textContent === getLangLabel(lang));
    if (match) match.classList.add('selected');
    btn.textContent = getLangLabel(lang) + ' ▾';
  }};
}

// ── CodeBlockLowlight + custom NodeView with language selector ──

const CodeBlockWithLang = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentNode = node;

      const dom = document.createElement('div');
      dom.className = 'code-block-wrapper';

      const toolbar = document.createElement('div');
      toolbar.className = 'code-block-toolbar';
      toolbar.contentEditable = 'false';

      const btn = document.createElement('button');
      btn.className = 'code-lang-btn';
      btn.textContent = getLangLabel(node.attrs.language || '') + ' ▾';
      btn.type = 'button';
      toolbar.appendChild(btn);

      const { destroy, updateSelection } = buildLangDropdown(btn, node.attrs.language || '', (lang) => {
        if (typeof getPos !== 'function') return;
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(getPos(), undefined, { ...currentNode.attrs, language: lang });
          return true;
        }).run();
      });

      const pre  = document.createElement('pre');
      const code = document.createElement('code');
      pre.appendChild(code);

      dom.appendChild(toolbar);
      dom.appendChild(pre);

      return {
        dom,
        contentDOM: code,
        destroy,
        update(updatedNode) {
          if (updatedNode.type.name !== 'codeBlock') return false;
          currentNode = updatedNode;
          updateSelection(updatedNode.attrs.language || '');
          return true;
        },
      };
    };
  },
}).configure({ lowlight });

// ── Gap cursor class toggle (for caret-color: transparent) ──

// 블록 요소 다음에 항상 빈 단락 보장 → gap cursor 문제 근본 해결
const BLOCK_NEEDS_PARAGRAPH = new Set(['image', 'table', 'mermaidBlock', 'codeBlock', 'tocBlock']);

const EnsureParagraphAfterBlock = Extension.create({
  name: 'ensureParagraphAfterBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;
          const { doc, schema, tr } = newState;
          const para = schema.nodes.paragraph;
          let modified = false;
          doc.forEach((node, offset) => {
            if (!BLOCK_NEEDS_PARAGRAPH.has(node.type.name)) return;
            const after = offset + node.nodeSize;
            const next = after < doc.content.size ? doc.resolve(after).nodeAfter : null;
            if (!next || BLOCK_NEEDS_PARAGRAPH.has(next.type.name)) {
              tr.insert(tr.mapping.map(after), para.create());
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});

// ── Markdown table helpers ──────────────────────────────────

function parseTableCells(text) {
  const t = text.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  const cells = t.slice(1, -1).split('|').map(c => c.trim());
  return cells.length > 0 ? cells : null;
}

function isSeparatorRow(cells) {
  return cells.every(c => /^[-: ]+$/.test(c));
}

const MarkdownTableInput = Extension.create({
  name: 'markdownTableInput',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parent.type.name !== 'paragraph') return false;

        const sepCells = parseTableCells($from.parent.textContent);
        if (!sepCells || !isSeparatorRow(sepCells)) return false;

        const currentStart = $from.before($from.depth);
        const currentEnd   = $from.after($from.depth);
        const prevNode     = state.doc.resolve(currentStart).nodeBefore;
        if (!prevNode || prevNode.type.name !== 'paragraph') return false;

        const headerCells = parseTableCells(prevNode.textContent);
        if (!headerCells || isSeparatorRow(headerCells) || headerCells.length !== sepCells.length) return false;

        const schema = state.schema;
        if (!schema.nodes.table) return false;

        const headerRow = schema.nodes.tableRow.create(null,
          headerCells.map(text =>
            schema.nodes.tableHeader.create(null,
              schema.nodes.paragraph.create(null, text ? [schema.text(text)] : [])
            )
          )
        );
        const bodyRow = schema.nodes.tableRow.create(null,
          headerCells.map(() =>
            schema.nodes.tableCell.create(null, schema.nodes.paragraph.create())
          )
        );
        const table = schema.nodes.table.create(null, [headerRow, bodyRow]);

        const { tr } = state;
        tr.replaceWith(currentStart - prevNode.nodeSize, currentEnd, table);
        this.editor.view.dispatch(tr);
        return true;
      },
    };
  },
});

// ── Slash command menu ─────────────────────────────────────

const SLASH_COMMANDS = [
  {
    name: 'table',
    label: '테이블',
    description: '행과 열로 이루어진 표',
    icon: '▤',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    name: 'toc',
    label: '목차',
    description: '문서의 제목으로 목차 자동 생성',
    icon: '≡',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'tocBlock' })
        .run();
    },
  },
  {
    name: 'mermaid',
    label: 'Mermaid 다이어그램',
    description: '플로우차트, 시퀀스 다이어그램 등',
    icon: '🧩',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertContent({ type: 'mermaidBlock', attrs: { code: 'graph TD\n  A --> B' } })
        .run();
    },
  },
];

function renderSlashMenu() {
  let el = null;
  let activeIndex = 0;
  let items = [];
  let commandFn = null;

  function buildEl() {
    if (el) el.remove();
    if (!items.length) { el = null; return; }

    el = document.createElement('div');
    el.className = 'slash-menu';
    document.body.appendChild(el);
    renderItems();
  }

  function renderItems() {
    if (!el) return;
    el.innerHTML = '';
    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'slash-menu-item' + (i === activeIndex ? ' selected' : '');
      div.innerHTML = `<span class="slash-menu-icon">${item.icon}</span>
        <div class="slash-menu-text">
          <div class="slash-menu-label">${item.label}</div>
          <div class="slash-menu-desc">${item.description}</div>
        </div>`;
      div.addEventListener('mousedown', (e) => { e.preventDefault(); commandFn(item); });
      el.appendChild(div);
    });
  }

  function position(clientRect) {
    if (!el || !clientRect) return;
    const rect = typeof clientRect === 'function' ? clientRect() : clientRect;
    if (!rect) return;
    el.style.top  = (rect.bottom + 6) + 'px';
    el.style.left = rect.left + 'px';
  }

  function destroy() { el?.remove(); el = null; }

  return {
    onStart(props) {
      items = props.items; commandFn = props.command; activeIndex = 0;
      buildEl(); position(props.clientRect);
    },
    onUpdate(props) {
      items = props.items; commandFn = props.command;
      buildEl(); position(props.clientRect);
    },
    onKeyDown({ event }) {
      if (!el || !items.length) return false;
      if (event.key === 'ArrowDown') { activeIndex = (activeIndex + 1) % items.length; renderItems(); return true; }
      if (event.key === 'ArrowUp')   { activeIndex = (activeIndex - 1 + items.length) % items.length; renderItems(); return true; }
      if (event.key === 'Enter')     { commandFn(items[activeIndex]); return true; }
      if (event.key === 'Escape')    { destroy(); return true; }
      return false;
    },
    onExit() { destroy(); },
  };
}

const SlashCommands = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => props.command({ editor, range }),
        items: ({ query }) => {
          const q = query.toLowerCase();
          return SLASH_COMMANDS.filter(c =>
            c.name.startsWith(q) || c.label.toLowerCase().includes(q)
          );
        },
        render: renderSlashMenu,
      }),
    ];
  },
});

// ── Mermaid Block Node ──────────────────────────────────────

let mermaidReady = false;
function initMermaid() {
  if (mermaidReady || !window.mermaid) return;
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      primaryColor: '#f0f0f0',
      primaryTextColor: '#333',
      primaryBorderColor: '#999',
      lineColor: '#777',
      secondaryColor: '#e8e8e8',
      tertiaryColor: '#f5f5f5',
      tertiaryTextColor: '#555',
      edgeLabelBackground: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '14px',
      clusterBkg: '#efefef',
      clusterBorder: '#aaa',
    },
  });
  mermaidReady = true;
}

async function renderMermaid(code, previewEl) {
  if (!window.mermaid) return;
  initMermaid();
  try {
    const id = 'mm' + Date.now() + Math.random().toString(36).slice(2);
    const { svg } = await window.mermaid.render(id, code.trim() || 'graph TD\n  A --> B');
    previewEl.innerHTML = svg;
  } catch (e) {
    previewEl.innerHTML = `<div class="mermaid-error">⚠ ${e.message}</div>`;
  }
}

const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: 'graph TD\n  A --> B',
        parseHTML: el => decodeURIComponent(el.getAttribute('data-code') || ''),
        renderHTML: attrs => ({ 'data-code': encodeURIComponent(attrs.code || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'mermaid' }, HTMLAttributes)];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\/mermaid\s$/,
        handler: ({ state, range }) => {
          const node = this.type.create({ code: 'graph TD\n  A --> B' });
          state.tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'mermaid-block';
      dom.contentEditable = 'false';

      const header = document.createElement('div');
      header.className = 'mermaid-header';
      header.innerHTML = '<span>Mermaid</span>';

      const textarea = document.createElement('textarea');
      textarea.className = 'mermaid-code';
      textarea.value = node.attrs.code;
      textarea.spellcheck = false;

      const preview = document.createElement('div');
      preview.className = 'mermaid-preview';

      dom.appendChild(header);
      dom.appendChild(textarea);
      dom.appendChild(preview);

      renderMermaid(node.attrs.code, preview);

      let debounce;
      textarea.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const code = textarea.value;
          renderMermaid(code, preview);
          if (typeof getPos === 'function') {
            editor.commands.command(({ tr }) => {
              tr.setNodeMarkup(getPos(), undefined, { code });
              return true;
            });
          }
        }, 400);
      });

      textarea.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = textarea.selectionStart;
          textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(textarea.selectionEnd);
          textarea.selectionStart = textarea.selectionEnd = s + 2;
        }
      });

      // Prevent ProseMirror from handling events inside this NodeView
      dom.addEventListener('mousedown', (e) => e.stopPropagation());

      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mermaidBlock') return false;
          if (updatedNode.attrs.code !== textarea.value) {
            textarea.value = updatedNode.attrs.code;
            renderMermaid(updatedNode.attrs.code, preview);
          }
          return true;
        },
      };
    };
  },
});

// ── Table of Contents Block ────────────────────────────────

const TocBlock = Node.create({
  name: 'tocBlock',
  group: 'block',
  atom: true,
  draggable: false,

  parseHTML() { return [{ tag: 'div[data-type="toc"]' }]; },
  renderHTML() { return ['div', { 'data-type': 'toc' }]; },

  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div');
      dom.className = 'toc-block';
      dom.contentEditable = 'false';

      const header = document.createElement('div');
      header.className = 'toc-header';
      header.textContent = '목차';

      const list = document.createElement('div');
      list.className = 'toc-list';

      dom.appendChild(header);
      dom.appendChild(list);

      function render() {
        list.innerHTML = '';
        const headings = [];
        editor.state.doc.forEach(node => {
          if (node.type.name === 'heading')
            headings.push({ level: node.attrs.level, text: node.textContent });
        });

        if (!headings.length) {
          const empty = document.createElement('div');
          empty.className = 'toc-empty';
          empty.textContent = '제목을 추가하면 목차가 생성됩니다';
          list.appendChild(empty);
          return;
        }

        headings.forEach(({ level, text }) => {
          const item = document.createElement('div');
          item.className = `toc-item toc-h${level}`;
          item.textContent = text;
          item.style.paddingLeft = `${(level - 1) * 16}px`;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const els = editor.view.dom.querySelectorAll(`h${level}`);
            for (const el of els) {
              if (el.textContent.trim() === text) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
              }
            }
          });
          list.appendChild(item);
        });
      }

      render();
      editor.on('update', render);

      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy() { editor.off('update', render); },
      };
    };
  },
});

let editor = null;
let imageUploadFn = null;

export function initEditor(onUpdate, onSelectionUpdate, onImageUpload, onSave) {
  imageUploadFn = onImageUpload || null;

  const SaveShortcut = Extension.create({
    name: 'saveShortcut',
    addKeyboardShortcuts() {
      return {
        'Mod-Enter': () => { onSave?.(); return true; },
      };
    },
  });

  editor = new Editor({
    element: document.getElementById('editor'),
    editorProps: {
      attributes: { spellcheck: 'false' },
    },
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      SaveShortcut,
      CodeBlockWithLang,
      MermaidBlock,
      TocBlock,
      SlashCommands,
      EnsureParagraphAfterBlock,
      MarkdownTableInput,
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TableUI,
    ],
    content: '',
    onUpdate({ editor }) { onUpdate(editor); },
    onSelectionUpdate({ editor }) { onSelectionUpdate?.(editor); },
  });

  editor.view.dom.addEventListener('paste', handleImagePaste);
  return editor;
}

async function handleImagePaste(e) {
  if (!editor || !imageUploadFn) return;
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) continue;
    e.preventDefault();
    e.stopPropagation();

    const file = item.getAsFile();
    if (!file) continue;
    const ext = item.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');

    try {
      const base64 = await fileToBase64(file);
      const imgUrl = await imageUploadFn(base64, ext);
      editor.chain().focus().setImage({ src: imgUrl }).run();
    } catch (err) {
      console.error('Image upload error:', err);
    }
    break;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function setContent(markdownContent) {
  if (!editor) return;
  // Pre-process: ```mermaid blocks → custom div (before marked parses)
  const processed = (markdownContent || '')
    .replace(/<!-- toc -->/g, '<div data-type="toc"></div>')
    .replace(
      /```mermaid\n([\s\S]*?)```/g,
      (_, code) => `<div data-type="mermaid" data-code="${encodeURIComponent(code.trim())}"></div>`,
    );
  const html = window.marked ? window.marked.parse(processed) : processed;
  editor.commands.setContent(html, false);
}

export function getMarkdown() {
  if (!editor) return '';
  const html = editor.getHTML();

  const td = new window.TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  td.addRule('table', {
    filter: 'table',
    replacement(_, node) {
      const rows = [];
      node.querySelectorAll('tr').forEach((tr, rowIdx) => {
        const cells = [...tr.querySelectorAll('th, td')].map(cell =>
          cell.textContent.trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')
        );
        rows.push('| ' + cells.join(' | ') + ' |');
        if (rowIdx === 0) rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      });
      return '\n\n' + rows.join('\n') + '\n\n';
    },
  });

  td.addRule('tableWrapper', {
    filter: node => node.tagName === 'DIV' && node.classList?.contains('tableWrapper'),
    replacement: content => content,
  });

  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (c) => `~~${c}~~`,
  });

  td.addRule('toc', {
    filter: (node) => node.nodeType === 1 && node.getAttribute('data-type') === 'toc',
    replacement: () => '\n\n<!-- toc -->\n\n',
  });

  td.addRule('mermaid', {
    filter: (node) => node.nodeType === 1 && node.getAttribute('data-type') === 'mermaid',
    replacement: (_, node) => {
      const code = decodeURIComponent(node.getAttribute('data-code') || '');
      return `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
    },
  });

  td.addRule('image', {
    filter: 'img',
    replacement: (_, node) => `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`,
  });

  return td.turndown(html);
}

export function focusEditor() {
  editor?.commands.focus('end');
}
