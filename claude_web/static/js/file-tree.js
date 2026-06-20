// ===== File Tree / File Picker / File Viewer =====

function homeDir() { return '/home'; }

// ===== File Picker Modal =====
const filePickerModal = $('filePickerModal');
const filePickerContent = $('filePickerContent');
const filePickerBreadcrumb = $('filePickerBreadcrumb');

let filePickerCurrentPath = '';

async function openFilePicker() {
  filePickerCurrentPath = cwdInput.value.trim() || homeDir();
  await loadFilePickerPath(filePickerCurrentPath);
  const m = $('filePickerModal');
  if (m) {
    openModal(m);
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-backdrop')), {once: true}));
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }, {once: true});
  }
}

async function loadFilePickerPath(path) {
  try {
    const r = await fetch('/api/tree', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path}),
    });
    if (!r.ok) return;
    const data = await r.json();
    filePickerCurrentPath = data.path;
    $('filePickerBreadcrumb').textContent = path;
    renderFilePickerContent(data.children || [], path);
  } catch {}
}

function renderFilePickerContent(children, basePath) {
  const dirs = children.filter(c => c.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
  const files = children.filter(c => c.type === 'file').sort((a, b) => a.name.localeCompare(b.name));

  let html = '<div style="padding:4px 0;">';

  if (basePath !== '/') {
    const parent = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const parentPath = parent.substring(0, parent.lastIndexOf('/')) || '/';
    html += `<div class="item" onclick="navigateFilePicker('${escapeHtml(parentPath)}')" style="color:var(--accent);padding:6px 12px;cursor:pointer;">⬆ 父目录</div>`;
  }

  dirs.forEach(d => {
    html += `<div class="item" ondblclick="navigateFilePicker('${escapeHtml(basePath.endsWith('/') ? basePath : basePath + '/')}${escapeHtml(d.name)}')" onclick="navigateFilePicker('${escapeHtml(basePath.endsWith('/') ? basePath : basePath + '/')}${escapeHtml(d.name)}')" style="color:var(--accent);padding:6px 12px;cursor:pointer;">📁 ${escapeHtml(d.name)}</div>`;
  });

  files.forEach(f => {
    html += `<div class="item disabled" style="padding:6px 12px;">📄 ${escapeHtml(f.name)}</div>`;
  });

  if (!dirs.length && !files.length) {
    html += '<div style="padding:8px 12px;color:var(--text-subtle);font-size:12px;">空目录</div>';
  }

  html += '</div>';
  $('filePickerContent').innerHTML = html;
}

function navigateFilePicker(path) {
  loadFilePickerPath(path);
}

async function confirmFilePickerSelection() {
  if (filePickerCurrentPath) {
    cwdInput.value = filePickerCurrentPath;
    cwdInput.dispatchEvent(new Event('change'));
    const pm = $('filePickerModal');
    if (pm) closeModal(pm);
    await upsertCwdHistory(filePickerCurrentPath);
    refreshCwds();
    refreshGitStatus();
  }
}

// ===== File Tree Modal =====
let openFileTabs = [];
let currentEditingTab = null;

function openFileTree() {
  const cwd = cwdInput.value.trim() || homeDir();
  $('fileTreeCwdLabel').textContent = cwd;
  openFileTabs = [];
  renderFileViewerTabs();
  $('fileViewerBody').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-subtle);font-size:13px;">双击文件查看内容</div>';
  $('fileViewerFooter').style.display = 'none';
  const ft = $('fileTreeModal');
  if (ft) {
    openModal(ft);
    ft.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-backdrop')), {once: true}));
    ft.addEventListener('click', (e) => { if (e.target === ft) closeModal(ft); }, {once: true});
  }
  loadFileTree(cwd);
}

async function loadFileTree(path) {
  try {
    const r = await fetch('/api/tree', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path}),
    });
    if (!r.ok) return;
    const data = await r.json();
    $('fileTreeCwdLabel').textContent = data.path;
    $('fileTreeContent').innerHTML = renderFileTreeData(data.children || [], 0, data.path, '');
  } catch (e) {
    console.error('Failed to load file tree:', e);
  }
}

function renderFileTreeData(children, depth, basePath, parentName) {
  let html = '';
  children.forEach(child => {
    const fullPath = (basePath.endsWith('/') ? basePath : basePath + '/') + child.name;
    const isDir = child.type === 'dir';
    const indent = depth * 20;
    html += `<div class="file-tree-item ${isDir ? 'folder' : ''}" data-parent="${escapeHtml(parentName)}" data-name="${escapeHtml(child.name)}" data-type="${child.type}" data-path="${escapeHtml(fullPath)}" style="--depth:${depth};padding-left:${indent}px;" onclick="handleFileTreeClick(this)">`;

    if (isDir) {
      html += `<span class="chevron hidden">▶</span>`;
      html += `<span class="icon">📁</span>`;
    } else {
      html += `<span class="chevron hidden">▶</span>`;
      html += `<span class="icon">📄</span>`;
    }

    html += `<span class="fname">${escapeHtml(child.name)}</span>`;
    html += '</div>';
  });
  return html;
}

function removeChildrenAndDescendants(el) {
  const parentName = el.dataset.name;
  let next = el.nextElementSibling;
  let depth = 1;
  while (next && depth > 0) {
    const nextDepth = parseInt(next.style.getPropertyValue('--depth')) || 0;
    if (next.dataset.parent === parentName || nextDepth > depth - 1) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
      if (nextDepth >= depth) {
        depth = nextDepth + 1;
      }
    } else {
      break;
    }
  }
}

async function handleFileTreeClick(el) {
  const name = el.dataset.name;
  const type = el.dataset.type;
  const path = el.dataset.path;
  const chevron = el.querySelector('.chevron');
  const icon = el.querySelector('.icon');

  if (type === 'dir') {
    const isExpanded = chevron.classList.contains('open');

    if (isExpanded) {
      chevron.classList.remove('open');
      icon.textContent = '📁';
      removeChildrenAndDescendants(el);
    } else {
      chevron.classList.add('open');
      icon.textContent = '📂';
      try {
        const r = await fetch('/api/tree', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({path}),
        });
        if (r.ok) {
          const data = await r.json();
          const depth = parseInt(el.style.getPropertyValue('--depth')) + 1;
          const childrenHtml = renderFileTreeData(
            data.children || [],
            depth,
            data.path,
            name
          );
          const wrapper = document.createElement('div');
          wrapper.dataset.parent = name;
          wrapper.innerHTML = childrenHtml;
          while (wrapper.firstChild) {
            el.after(wrapper.firstChild);
          }
        }
      } catch (e) {
        console.error('Failed to load directory:', e);
        chevron.classList.remove('open');
        icon.textContent = '📁';
      }
    }
  } else {
    openFileInViewer(path, name);
  }
}

async function openFileInViewer(path, name) {
  const existingTab = openFileTabs.find(t => t.path === path);
  if (existingTab) {
    switchToFileTab(existingTab);
    return;
  }

  try {
    const r = await fetch('/api/file-content?path=' + encodeURIComponent(path) + '&max_lines=10000');
    if (!r.ok) {
      alert('无法读取文件');
      return;
    }
    const data = await r.json();

    openFileTabs.push({path, name, content: data.content, language: data.language, linesTotal: data.lines_total});
    renderFileViewerTabs();
    switchToFileTab(openFileTabs[openFileTabs.length - 1]);
  } catch (e) {
    console.error('Failed to load file:', e);
    alert('读取文件失败');
  }
}

function renderFileViewerTabs() {
  $('fileViewerTabs').innerHTML = openFileTabs.map((tab, i) =>
    `<div class="file-viewer-tab ${i === 0 ? 'active' : ''}" onclick="switchToFileTab(openFileTabs[${i}])">
      ${escapeHtml(tab.name)}
      <span class="close-tab" onclick="event.stopPropagation();closeFileTab(${i})">×</span>
    </div>`
  ).join('');
}

function switchToFileTab(tab) {
  Array.from($('fileViewerTabs').children).forEach((el, i) => {
    el.classList.toggle('active', openFileTabs[i] === tab);
  });

  $('fileViewerPath').textContent = tab.path;
  $('fileViewerLang').textContent = tab.language || 'text';
  $('fileViewerFooter').style.display = 'flex';

  const allLines = tab.content.split('\n');
  let gutterHtml = '';
  let contentHtml = '';
  for (let i = 0; i < allLines.length; i++) {
    const num = i + 1;
    const line = escapeHtml(allLines[i]);
    gutterHtml += `<div class="gutter-line">${num}</div>`;
    contentHtml += line + '\n';
  }

  $('fileViewerBody').innerHTML = `
    <div class="file-viewer-editor">
      <div class="editor-gutter">${gutterHtml}</div>
      <div class="editor-content" id="fileEditorContent">${contentHtml}</div>
    </div>
  `;

  const editBtn = $('toggleEditBtn');
  const saveBtn = $('saveFileBtn');
  if (editBtn) {
    editBtn.style.display = '';
    editBtn.textContent = '✏️ 编辑';
    const currentTab = tab;
    editBtn.onclick = () => {
      if (currentEditingTab) {
        editBtn.textContent = '✏️ 编辑';
        if (saveBtn) saveBtn.style.display = 'none';
        currentEditingTab = null;
        const activeIdx = Array.from($('fileViewerTabs').children).findIndex(el => el.classList.contains('active'));
        if (activeIdx >= 0 && openFileTabs[activeIdx]) {
          switchToFileTab(openFileTabs[activeIdx]);
        }
      } else {
        const idx = openFileTabs.indexOf(currentTab);
        const activeIdx = Array.from($('fileViewerTabs').children).findIndex(el => el.classList.contains('active'));
        const activeTab = openFileTabs[activeIdx] || openFileTabs[idx >= 0 ? idx : 0];
        if (!activeTab) return;
        currentEditingTab = activeTab;
        const content = activeTab.content;
        const allLines = content.split('\n');
        let gutterHtml = '';
        for (let i = 0; i < allLines.length; i++) {
          gutterHtml += `<div class="gutter-line">${i + 1}</div>`;
        }
        $('fileViewerBody').innerHTML = `
          <div class="file-viewer-editor" style="min-height:400px;">
            <div class="editor-gutter">${gutterHtml}</div>
            <div class="editor-content" style="min-height:400px;">
              <textarea class="editor-textarea" id="fileTextarea" style="min-height:400px;width:100%;">${escapeHtml(content)}</textarea>
            </div>
          </div>`;
        editBtn.textContent = '👁️ 查看';
        if (saveBtn) saveBtn.style.display = '';
      }
    };
  }
  if (saveBtn) {
    saveBtn.style.display = 'none';
    saveBtn.onclick = async () => {
      const ta = $('fileTextarea');
      if (!ta || !currentEditingTab) return;
      const content = ta.value;
      const t = currentEditingTab;
      try {
        const r = await fetch('/api/file-save', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({path: t.path, content}),
        });
        if (r.ok) {
          t.content = content;
          t.language = '';
          alert('保存成功！');
          switchToFileTab(t);
          loadFileTree($('fileTreeCwdLabel').textContent);
        } else {
          const d = await r.json().catch(() => ({}));
          alert('保存失败: ' + (d.detail || r.statusText));
        }
      } catch (e) {
        alert('保存失败: ' + e.message);
      }
    };
  }
}

function closeFileTab(idx) {
  openFileTabs.splice(idx, 1);
  renderFileViewerTabs();
  if (openFileTabs.length === 0) {
    $('fileViewerBody').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-subtle);font-size:13px;">双击文件查看内容</div>';
    $('fileViewerFooter').style.display = 'none';
  } else {
    const newIndex = Math.min(idx, openFileTabs.length - 1);
    switchToFileTab(openFileTabs[newIndex]);
  }
}

// file tree refresh
const fileTreeRefreshBtn = $('fileTreeRefreshBtn');
if (fileTreeRefreshBtn) {
  fileTreeRefreshBtn.addEventListener('click', () => {
    loadFileTree($('fileTreeCwdLabel').textContent);
  });
}

// Folder picker button
const openFolderBtn = $('openFolderBtn');
if (openFolderBtn) {
  openFolderBtn.addEventListener('click', openFilePicker);
}

// File tree button
const openFileTreeBtn = $('openFileTreeBtn');
if (openFileTreeBtn) {
  openFileTreeBtn.addEventListener('click', openFileTree);
}
