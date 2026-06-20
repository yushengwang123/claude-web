// ===== CWD (Current Working Directory) =====

async function refreshCwds() {
  try {
    const r = await fetch('/api/cwds');
    if (!r.ok) return;
    const list = await r.json();
    cwdList.innerHTML = list.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
  } catch {}
}

// ===== CWD History Modal =====

async function openCwdHistory() {
  const ch = $('cwdHistoryModal');
  if (ch) {
    openModal(ch);
    ch.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-backdrop')), {once: true}));
    ch.addEventListener('click', (e) => { if (e.target === ch) closeModal(ch); }, {once: true});
  }
  await loadCwdHistory();
}

async function loadCwdHistory() {
  try {
    const r = await fetch('/api/cwd-history');
    if (!r.ok) {
      $('cwdHistoryList').innerHTML = '<div class="text-xs text-center py-6" style="color:#ef4444;">加载失败</div>';
      return;
    }
    const items = await r.json();
    if (items.length === 0) {
      $('cwdHistoryList').innerHTML = '<div class="text-xs text-center py-6" style="color:var(--text-subtle);">暂无目录历史</div>';
      return;
    }

    let html = '';
    items.forEach(item => {
      const path = item.path;
      const time = new Date(item.created_at * 1000).toLocaleString('zh-CN');
      html += `<div class="cwd-history-item" onclick="selectCwdHistory('${escapeHtml(path)}')">
        <span style="font-size:14px;">📁</span>
        <span class="path" title="${escapeHtml(path)}">${escapeHtml(path)}</span>
        <span style="font-size:10px;color:var(--text-subtle);white-space:nowrap;">${time}</span>
        <button class="del-btn" onclick="event.stopPropagation();deleteCwdHistory('${escapeHtml(path)}')" title="删除">×</button>
      </div>`;
    });
    $('cwdHistoryList').innerHTML = html;
  } catch {
    $('cwdHistoryList').innerHTML = '<div class="text-xs text-center py-6" style="color:#ef4444;">加载失败</div>';
  }
}

async function selectCwdHistory(path) {
  cwdInput.value = path;
  cwdInput.dispatchEvent(new Event('change'));
  const ch = $('cwdHistoryModal');
  if (ch) closeModal(ch);
  await upsertCwdHistory(path);
  refreshGitStatus();
}

async function deleteCwdHistory(path) {
  if (!confirm('删除 "' + path + '" 从目录历史？')) return;
  try {
    await fetch('/api/cwd-history/' + encodeURIComponent(path), {method: 'DELETE'});
    await loadCwdHistory();
  } catch {}
}

async function clearCwdHistory() {
  if (!confirm('确定要清空所有目录历史吗？')) return;
  try {
    await fetch('/api/cwd-history/clear', {method: 'POST'});
    await loadCwdHistory();
  } catch {}
}

async function upsertCwdHistory(path) {
  try {
    await fetch('/api/cwd-history?path=' + encodeURIComponent(path), {method: 'POST'});
  } catch {}
}

// ===== Event listeners =====

// CWD history button
const openCwdHistoryBtn = $('openCwdHistoryBtn');
if (openCwdHistoryBtn) {
  openCwdHistoryBtn.addEventListener('click', openCwdHistory);
}

// Keyboard shortcut: Ctrl+H for CWD history
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'h' && !e.shiftKey) {
    const tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      openCwdHistory();
    }
  }
});

// CWD clear all button
const cwdClearAllBtn = $('cwdClearAllBtn');
if (cwdClearAllBtn) {
  cwdClearAllBtn.addEventListener('click', clearCwdHistory);
}

// Auto-save CWD to history on change
cwdInput.addEventListener('change', async () => {
  const cwd = cwdInput.value.trim();
  if (cwd) {
    await upsertCwdHistory(cwd);
  }
});

// Initial load: also load from sessions database for the datalist
async function initCwdHistorySync() {
  try {
    const r = await fetch('/api/cwds');
    if (!r.ok) return;
    const paths = await r.json();
    for (const p of paths) {
      if (p && p.trim()) {
        await upsertCwdHistory(p.trim());
      }
    }
  } catch {}
}

initCwdHistorySync();
