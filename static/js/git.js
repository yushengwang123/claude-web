// ===== Git Operations =====

const _ge = (id) => document.getElementById(id);
function _g(id) { return _ge('git' + id); }

// ===== Git result display helper =====
let _gitOutputVisible = false;

function toggleGitOutput() {
  var el = _ge('gitOutput');
  var chevron = _ge('gitOutputChevron');
  if (!el || !chevron) return;
  _gitOutputVisible = !_gitOutputVisible;
  el.style.display = _gitOutputVisible ? 'block' : 'none';
  chevron.style.transform = _gitOutputVisible ? 'rotate(90deg)' : 'rotate(0deg)';
}

function _showGitResult(text, success) {
  var el = _ge('gitOutput');
  if (!el) return;
  if (text) {
    el.textContent = text;
  }
  if (text && !_gitOutputVisible) {
    toggleGitOutput();
  }
  if (el.___timer) clearTimeout(el.___timer);
  el.___timer = setTimeout(function() {
    el.textContent = '';
    if (_gitOutputVisible) toggleGitOutput();
  }, 6000);
}

function _clearGitOutput() {
  _showGitResult('', false);
}

// Current git state for the modal
let _gitStatusData = null;

// ===== Git status (top bar) =====
async function refreshGitStatus() {
  const cwd = cwdInput.value.trim();
  if (!cwd) { gitBar.classList.add('hidden'); return; }
  try {
    const r = await fetch('/api/git?cwd=' + encodeURIComponent(cwd));
    if (!r.ok) { gitBar.classList.add('hidden'); return; }
    const d = await r.json();
    if (!d.available || !d.branch) { gitBar.classList.add('hidden'); return; }
    gitBar.classList.remove('hidden');
    gitBar.textContent = `⎇ ${d.branch}${d.dirty ? ' ±' + d.dirty : ''}`;
  } catch { gitBar.classList.add('hidden'); }
}

// ===== Git Modal =====
function openGitModal() {
  const cwd = cwdInput.value.trim();
  if (!cwd) {
    alert('请先设置工作目录');
    return;
  }
  const gm = $('gitModal');
  if (gm) {
    openModal(gm);
    gm.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-backdrop')), {once: true}));
    gm.addEventListener('click', (e) => { if (e.target === gm) closeModal(gm); }, {once: true});
  }
  _loadGitStatusDetail(cwd);
  _switchGitTab('files');
  _clearGitOutput();
}

async function _loadGitStatusDetail(cwd) {
  try {
    const r = await fetch('/api/git/status-detail?cwd=' + encodeURIComponent(cwd));
    if (!r.ok) {
      $('gitModalBranch').textContent = '—';
      $('gitModalStatus').textContent = '获取状态失败';
      return;
    }
    const data = await r.json();
    _gitStatusData = data;
    if (!data.available) {
      $('gitModalBranch').textContent = '—';
      $('gitModalStatus').textContent = '非 Git 仓库';
      _ge('gitFileList').innerHTML = '<div class="git-empty-state"><span class="icon">📂</span>当前目录不是 Git 仓库</div>';
      return;
    }
    $('gitModalBranch').textContent = data.branch;
    $('gitModalRemote').textContent = data.remote_url ? (data.remote_url.split('/').pop() || '') : '';
    if (data.files && data.files.length > 0) {
      const total = data.files.reduce((s, g) => s + g.files.length, 0);
      $('gitModalDirty').textContent = ' ±' + total;
      $('gitModalStatus').textContent = '(有未提交的修改)';
      _renderGitFileList(data);
    } else {
      $('gitModalDirty').textContent = '';
      $('gitModalStatus').textContent = '(工作区干净)';
      _ge('gitFileList').innerHTML = '<div class="git-empty-state"><span class="icon">✅</span>工作区干净</div>';
    }
  } catch (e) {
    $('gitModalBranch').textContent = '—';
    $('gitModalStatus').textContent = '获取状态失败';
  }
}

// ===== Tab switching =====
function _switchGitTab(tabName) {
  document.querySelectorAll('.git-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    if (btn.dataset.tab === tabName) {
      btn.style.borderBottomColor = 'var(--accent)';
      btn.style.color = 'var(--text)';
    } else {
      btn.style.borderBottomColor = 'transparent';
      btn.style.color = 'var(--text-subtle)';
    }
  });
  if (_ge('gitFilesPanel')) _ge('gitFilesPanel').style.display = tabName === 'files' ? 'flex' : 'none';
  if (_ge('gitLogPanel')) _ge('gitLogPanel').style.display = tabName === 'log' ? 'flex' : 'none';
  if (_ge('gitOutputSection')) _ge('gitOutputSection').style.display = tabName === 'files' ? 'flex' : 'none';
  _hideGitDiffView();
  if (tabName === 'log') {
    _doLoadLog(cwdInput.value.trim());
  }
}

// ===== Render file list grouped by category =====
function _renderGitFileList(data) {
  if (!data.files || data.files.length === 0) {
    _ge('gitFileList').innerHTML = '<div class="git-empty-state"><span class="icon">✅</span>工作区干净</div>';
    return;
  }

  let html = '';
  data.files.forEach((group, gi) => {
    const id = 'gitGroup' + gi;
    html += '<div class="git-file-group" data-group="' + group.key + '">';
    html += '<div class="git-file-group-header" onclick="window._toggleGroup(\'' + id + '\', this)">';
    html += '<span class="arrow">▼</span>';
    html += '<span class="cat-color" style="background:' + group.color + '"></span>';
    html += '<span style="color:' + group.color + '">' + group.icon + ' ' + group.category + '</span>';
    html += '<span class="count">' + group.files.length + '</span>';
    html += '<span style="margin-left:auto;"><input type="checkbox" class="group-select-all" data-group="gitGroup' + gi + '" title="全选本组" onclick="event.stopPropagation(); window._selectAllGroup(\'gitGroup' + gi + '\', this.checked)" /></span>';
    html += '</div>';
    html += '<div class="git-file-group-body" id="' + id + '" style="max-height:' + (group.files.length * 32 + 4) + 'px;">';
    group.files.forEach(f => {
      const statusLabel = _getStatusLabel(f.status, f.secondary);
      const stagedClass = ['staged_modified','staged_added','staged_renamed','staged_copied','staged_untracked','deleted_staged'].includes(group.key) ? 'staged' : '';
      html += '<div class="git-file-row ' + stagedClass + '" data-filename="' + escapeHtml(f.filename) + '" data-status="' + escapeHtml(f.status) + '">';
      html += '<input type="checkbox" title="选择此文件" />';
      html += '<span class="fname" title="' + escapeHtml(f.filename) + '" onclick="window._showFileDiff(\'' + escapeHtml(f.filename).replace(/'/g, "\\'") + '\')">' + escapeHtml(f.filename) + '</span>';
      html += '<span class="fstatus" style="background:' + group.color + '20;color:' + group.color + ';">' + escapeHtml(statusLabel) + '</span>';
      if (f.renames) {
        html += '<span class="frenames" title="' + escapeHtml(f.renames) + '">→ ' + escapeHtml(f.renames) + '</span>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  });

  _ge('gitFileList').innerHTML = html;

  _ge('gitFileList').querySelectorAll('.git-file-row').forEach(row => {
    row.addEventListener('click', function(e) {
      if (e.target.tagName === 'INPUT') return;
      var cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = !cb.checked;
    });
  });
}

function _getStatusLabel(status, secondary) {
  var labels = {
    'M': '修改', 'A': '新增', 'D': '删除', 'R': '重命名', 'C': '复制',
    '?: ': '未跟踪', ' M': '已修改', ' A': '已添加', ' D': '已删除',
    'MM': '修改', 'AM': '修改', 'AA': '冲突', 'UU': '冲突',
    'RD': '删除', 'RM': '重命名', 'RC': '复制',
  };
  var key = (status || '') + (secondary || '');
  return labels[key] || status + (secondary || '');
}

// ===== Toggle group collapse =====
window._toggleGroup = function(id, headerEl) {
  var body = document.getElementById(id);
  var arrow = headerEl.querySelector('.arrow');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    arrow.classList.remove('collapsed');
    body.style.maxHeight = body.scrollHeight + 'px';
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight;
    body.classList.add('collapsed');
    arrow.classList.add('collapsed');
  }
}

// ===== File diff view =====
function _hideGitDiffView() {
  var m = _ge('gitDiffModal');
  if (m) closeModal(m);
}

function _showFileDiff(filename) {
  var cwd = cwdInput.value.trim();
  if (!cwd) return;

  var modal = _ge('gitDiffModal');
  if (!modal) return;
  if (_ge('gitDiffTitle')) _ge('gitDiffTitle').textContent = '📄 ' + filename;
  if (_ge('gitDiffFileList')) _ge('gitDiffFileList').innerHTML = '<div style="padding:16px;color:var(--text-subtle);text-align:center;">加载中…</div>';
  openModal(modal);
  _doShowFileDiff(cwd, filename);
}

async function _doShowFileDiff(cwd, filename) {
  try {
    var [workR, cacheR] = await Promise.all([
      fetch('/api/git/diff?path=' + encodeURIComponent(filename) + '&cwd=' + encodeURIComponent(cwd) + '&cached=false'),
      fetch('/api/git/diff?path=' + encodeURIComponent(filename) + '&cwd=' + encodeURIComponent(cwd) + '&cached=true'),
    ]);

    var workData = workR.ok ? await workR.json() : null;
    var cacheData = cacheR.ok ? await cacheR.json() : null;
    var data = (cacheData && cacheData.diff_lines && cacheData.diff_lines.length > 0) ? cacheData : workData;

    if (!data || !data.diff_lines || data.diff_lines.length === 0) {
      if (_ge('gitDiffFileList')) _ge('gitDiffFileList').innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-subtle);">该文件没有可显示的差异</div>';
      return;
    }

    var html = '<table class="git-diff-table">';
    html += '<tr style="color:var(--text-subtle);font-size:11px;"><td class="line-num">旧</td><td class="line-num">新</td><td class="sign"></td><td>内容</td></tr>';
    data.diff_lines.forEach(function(line) {
      var rowClass = line.type === 'add' ? 'add' : line.type === 'remove' ? 'remove' : 'context';
      var sign = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      html += '<tr class="' + rowClass + '">';
      html += '<td class="line-num">' + (line.line_old !== null ? line.line_old : '') + '</td>';
      html += '<td class="line-num">' + (line.line_new !== null ? line.line_new : '') + '</td>';
      html += '<td class="sign">' + escapeHtml(sign) + '</td>';
      html += '<td>' + escapeHtml(line.content) + '</td>';
      html += '</tr>';
    });
    html += '</table>';
    if (_ge('gitDiffFileList')) _ge('gitDiffFileList').innerHTML = html;
  } catch (e) {
    if (_ge('gitDiffFileList')) _ge('gitDiffFileList').innerHTML = '<div style="padding:8px;color:#ef4444;">获取差异失败: ' + escapeHtml(e.message) + '</div>';
  }
}

// ===== Adding & un-adding =====
function _selectAllGroup(groupId, checked) {
  var body = _ge(groupId);
  if (!body) return;
  body.querySelectorAll('.git-file-row input[type="checkbox"]').forEach(function(cb) {
    cb.checked = checked;
  });
}

function _getSelectedFiles() {
  var rows = _ge('gitFileList').querySelectorAll('.git-file-row input[type="checkbox"]:checked');
  return Array.from(rows).map(function(cb) {
    var row = cb.closest('.git-file-row');
    return {
      filename: row.dataset.filename,
      status: row.dataset.status,
    };
  });
}

async function _addSelected() {
  var files = _getSelectedFiles();
  if (files.length === 0) { alert('请先勾选要添加的文件'); return; }
  var cwd = cwdInput.value.trim();

  var promises = files.map(function(f) {
    return fetch('/api/git/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: 'git add "' + f.filename.replace(/"/g, '') + '"'}),
    });
  });
  var results = await Promise.allSettled(promises);
  var okCount = 0;
  var failCount = 0;
  results.forEach(function(r) {
    if (r.status === 'fulfilled' && r.value.ok) { okCount++; }
    else { failCount++; }
  });

  if (okCount === files.length) {
    _showGitResult('✅ 已添加 ' + okCount + ' 个文件', true);
  } else if (okCount > 0) {
    _showGitResult('⚠️ 添加完成: ' + okCount + ' 成功, ' + failCount + ' 失败', false);
  } else {
    _showGitResult('❌ 添加失败', false);
  }

  files.forEach(function(f) {
    var row = _ge('gitFileList').querySelector('[data-filename="' + CSS.escape(f.filename) + '"]');
    if (row) { var cb = row.querySelector('input[type="checkbox"]'); if (cb) cb.checked = false; }
  });
  await _loadGitStatusDetail(cwd);
  refreshGitStatus();
}

async function _unaddSelected() {
  var files = _getSelectedFiles();
  if (files.length === 0) { alert('请先勾选要取消添加的文件'); return; }
  var cwd = cwdInput.value.trim();

  var promises = files.map(function(f) {
    return fetch('/api/git/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: 'git reset HEAD "' + f.filename.replace(/"/g, '') + '"'}),
    });
  });
  var results = await Promise.allSettled(promises);
  var okCount = 0;
  var failCount = 0;
  results.forEach(function(r) {
    if (r.status === 'fulfilled' && r.value.ok) { okCount++; }
    else { failCount++; }
  });

  if (okCount === files.length) {
    _showGitResult('✅ 已取消添加 ' + okCount + ' 个文件', true);
  } else if (okCount > 0) {
    _showGitResult('⚠️ 取消添加完成: ' + okCount + ' 成功, ' + failCount + ' 失败', false);
  } else {
    _showGitResult('❌ 取消添加失败', false);
  }

  files.forEach(function(f) {
    var row = _ge('gitFileList').querySelector('[data-filename="' + CSS.escape(f.filename) + '"]');
    if (row) { var cb = row.querySelector('input[type="checkbox"]'); if (cb) cb.checked = false; }
  });
  await _loadGitStatusDetail(cwd);
  refreshGitStatus();
}

async function _discardSelected() {
  var files = _getSelectedFiles();
  if (files.length === 0) { alert('请先勾选要丢弃的文件'); return; }
  var cwd = cwdInput.value.trim();
  if (!confirm('确定要丢弃 ' + files.length + ' 个文件的修改吗？此操作不可撤销。')) return;

  var promises = files.map(function(f) {
    return fetch('/api/git/discard', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: f.filename}),
    });
  });
  var results = await Promise.allSettled(promises);
  var okCount = 0;
  var failCount = 0;
  results.forEach(function(r) {
    if (r.status === 'fulfilled' && r.value.ok) { okCount++; }
    else { failCount++; }
  });

  if (okCount === files.length) {
    _showGitResult('✅ 已丢弃 ' + okCount + ' 个文件的修改', true);
  } else if (okCount > 0) {
    _showGitResult('⚠️ 丢弃完成: ' + okCount + ' 成功, ' + failCount + ' 失败', false);
  } else {
    _showGitResult('❌ 丢弃失败', false);
  }

  await _loadGitStatusDetail(cwd);
  refreshGitStatus();
}

// ===== Commit =====
function _showCommitBar() {
  if (_ge('gitCommitBar')) _ge('gitCommitBar').classList.remove('hidden');
  if (_ge('gitCommitMsgInput')) _ge('gitCommitMsgInput').focus();
}

function _hideCommitBar() {
  if (_ge('gitCommitBar')) _ge('gitCommitBar').classList.add('hidden');
  if (_ge('gitCommitMsgInput')) _ge('gitCommitMsgInput').value = '';
}

async function _doCommit(msg) {
  var cwd = cwdInput.value.trim();
  if (!msg) { alert('请输入提交信息'); return; }

  var commitBtn = _ge('gitCommitBtn');
  if (commitBtn) {
    commitBtn.textContent = '提交中…';
    commitBtn.disabled = true;
  }

  try {
    var r = await fetch('/api/git/commit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, message: msg}),
    });
    var data = await r.json();
    if (!r.ok) {
      _showGitResult('❌ 提交失败: ' + (data.detail || r.statusText), false);
    } else if (data.returncode !== 0) {
      var err = data.stderr || '';
      var out = data.stdout || '';
      var hint = _parseGitErrorHint(err, out);
      _showGitResult('❌ 提交失败: ' + (hint || err || out || 'unknown error'), false);
    } else {
      _showGitResult('✅ 提交成功', true);
      _hideCommitBar();
      _hideGitDiffView();
      await _loadGitStatusDetail(cwd);
      refreshGitStatus();
    }
  } catch (e) {
    _showGitResult('❌ 提交失败: ' + e.message, false);
  } finally {
    if (commitBtn) {
      commitBtn.textContent = '✓ 提交';
      commitBtn.disabled = false;
    }
  }
}

function _parseGitErrorHint(stderr, stdout) {
  var combined = (stderr + '\n' + stdout).toLowerCase();

  if (combined.indexOf('diverged') !== -1 || combined.indexOf('distanced') !== -1) {
    return '分支与远程出现分叉，请先拉取远程变更：\n  git pull --rebase origin main\n解决冲突后再提交。';
  }
  if (combined.indexOf('non-fast-forward') !== -1 || combined.indexOf('failed to push') !== -1) {
    return '远程有新的提交，请先拉取：\n  git pull --rebase origin main\n然后再重试提交。';
  }
  if (combined.indexOf('no upstream configured') !== -1 || combined.indexOf('unset upstream') !== -1) {
    return '当前分支未设置上游分支，请先关联远程分支：\n  git push --set-upstream origin main';
  }
  if (combined.indexOf('user.name') !== -1 || combined.indexOf('user.email') !== -1) {
    return 'Git 未配置用户信息，请运行：\n  git config --global user.name "Your Name"\n  git config --global user.email "you@example.com"\n然后再重试。';
  }
  if (combined.indexOf('gpg') !== -1 && combined.indexOf('failed') !== -1) {
    return 'GPG 签名失败。如果不需要签名，可以临时关闭：\n  git commit -m "xxx" --no-gpg-sign';
  }
  if (combined.indexOf('hook') !== -1 && combined.indexOf('refusing') !== -1) {
    return 'Git hook 拒绝提交。查看上面的错误信息了解具体原因。';
  }
  if (combined.indexOf('nothing to commit') !== -1 || combined.indexOf('working tree clean') !== -1) {
    return '没有可提交的变更。';
  }
  if (combined.indexOf('not stage') !== -1 || combined.indexOf('unstaged') !== -1) {
    return '请先将变更添加：\n  git add <文件>\n或全部添加：\n  git add -A';
  }
  return null;
}

// ===== Push / Pull =====
async function _doPush() {
  var cwd = cwdInput.value.trim();
  if (!confirm('确定要推送到远程吗？')) return;

  _showGitResult('↗ 推送中…', false);

  try {
    var r = await fetch('/api/git/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: 'git push'}),
    });
    var data = await r.json();
    if (!r.ok) {
      _showGitResult('❌ 推送失败: ' + (data.detail || r.statusText), false);
    } else {
      _showGitResult('✅ 推送成功', true);
      await _loadGitStatusDetail(cwd);
      refreshGitStatus();
    }
  } catch (e) {
    _showGitResult('❌ 推送失败: ' + e.message, false);
  }
}

async function _doPull() {
  var cwd = cwdInput.value.trim();
  if (!confirm('确定要从远程拉取吗？')) return;

  _showGitResult('↓ 拉取中…', false);

  try {
    var r = await fetch('/api/git/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: 'git pull'}),
    });
    var data = await r.json();
    if (!r.ok) {
      _showGitResult('❌ 拉取失败: ' + (data.detail || r.statusText), false);
    } else {
      _showGitResult('✅ 拉取成功', true);
      await _loadGitStatusDetail(cwd);
      refreshGitStatus();
    }
  } catch (e) {
    _showGitResult('❌ 拉取失败: ' + e.message, false);
  }
}

// ===== Commit history =====
async function _loadGitLog() {
  var cwd = (cwdInput.value.trim()) || '.';
  _doLoadLog(cwd);
}

async function _doLoadLog(cwd) {
  var content = $('gitLogContent');
  if (!content) return;
  content.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-subtle);">加载中…</div>';

  try {
    var r = await fetch('/api/git/log?cwd=' + encodeURIComponent(cwd) + '&limit=100');
    if (!r.ok) {
      content.innerHTML = '<div style="padding:12px;text-align:center;color:#ef4444;">获取提交历史失败</div>';
      return;
    }
    var data = await r.json();
    if (!data.commits || data.commits.length === 0) {
      content.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-subtle);">暂无提交历史（可能是一个新仓库）</div>';
      return;
    }

    var html = '';
    if (data.graph) {
      html += '<div style="padding:8px 12px;font-family:JetBrains Mono,monospace;font-size:12px;white-space:pre;color:var(--text-subtle);line-height:1.5;">' + escapeHtml(data.graph) + '</div>';
    }

    data.commits.forEach(function(c) {
      html += '<div class="git-commit-item" style="display:flex;align-items:center;gap:8px;padding:4px 12px;font-size:12px;font-family:JetBrains Mono,monospace;cursor:default;">';
      html += '<span class="git-commit-graph" style="white-space:pre;">' + escapeHtml(c.graph || '') + '</span>';
      html += '<span class="git-commit-hash">' + escapeHtml(c.hash) + '</span>';
      html += '<span class="git-commit-msg">' + escapeHtml(c.message) + '</span>';
      html += '<span class="git-commit-time">' + escapeHtml(c.time) + '</span>';
      html += '</div>';
    });

    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<div style="padding:12px;text-align:center;color:#ef4444;">获取提交历史失败: ' + escapeHtml(e.message) + '</div>';
  }
}

// ===== Command panel helpers =====
async function runGitCommand() {
  var cwd = cwdInput.value.trim();
  var cmd = _ge('gitCmdSelect').value;
  var arg = _ge('gitArgInput').value.trim();

  if (!cmd) {
    alert('请选择一个 Git 命令');
    return;
  }

  var fullCmd = cmd;
  if (arg) {
    fullCmd = cmd + (cmd.endsWith(' ') ? '' : ' ') + arg;
  }

  if (cmd === 'git add' && arg) {
    fullCmd = 'git add "' + arg.replace(/"/g, '') + '"';
  } else if (cmd === 'git commit -m' && arg) {
    fullCmd = 'git commit -m "' + arg.replace(/"/g, '') + '"';
  } else if (cmd === 'git checkout -b' && arg) {
    fullCmd = 'git checkout -b ' + arg;
  } else if (cmd === 'git checkout' && arg) {
    fullCmd = 'git checkout ' + arg;
  } else if (cmd === 'git switch' && arg) {
    fullCmd = 'git switch ' + arg;
  } else if (cmd === 'git merge' && arg) {
    fullCmd = 'git merge ' + arg;
  } else if (cmd === 'git rebase' && arg) {
    fullCmd = 'git rebase ' + arg;
  } else if (cmd === 'git reset HEAD' && arg) {
    fullCmd = 'git reset HEAD ' + arg;
  } else if (cmd === 'git tag' && arg) {
    fullCmd = 'git tag ' + arg;
  } else if (cmd === 'git revert' && arg) {
    fullCmd = 'git revert ' + arg;
  }

  _showGitResult('执行中…', false);

  try {
    var r = await fetch('/api/git/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({cwd: cwd, command: fullCmd}),
    });
    var data = await r.json();
    if (!r.ok) {
      _showGitResult('❌ 命令执行失败: ' + (data.detail || r.statusText), false);
    } else {
      _showGitResult('✅ ' + (data.stdout || '命令执行成功'), true);
      refreshGitStatus();
      _loadGitStatusDetail(cwd);
    }
  } catch (e) {
    _showGitResult('❌ 请求失败: ' + e.message, false);
  }
}

// ===== Checkpoint helpers (git-based) =====
function markLastUserMessageCheckpoint(userIdx) {
  const wrap = chatInner.querySelector(`.user-msg-wrap[data-user-index="${userIdx}"]`);
  if (!wrap) return;
  const actions = wrap.querySelector('.user-msg-actions');
  if (!actions || actions.querySelector('[data-restore]')) return;
  const btn = document.createElement('button');
  btn.dataset.restore = String(userIdx);
  btn.title = '回滚此轮前的文件状态';
  btn.className = 'hover:text-amber-500';
  btn.textContent = '⏪';
  actions.appendChild(btn);
}

async function restoreCheckpoint(userIdx) {
  if (!sessionId) return;
  try {
    const r = await fetch(`/api/sessions/${sessionId}/restore-checkpoint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ event_index: userIdx }),
    });
    if (!r.ok) {
      const msg = await r.text();
      alert('回滚失败: ' + msg);
      return;
    }
    const d = await r.json();
    addSystemInfo(`⏪ 已回滚 ${d.cwd} 到此轮之前的状态`);
    refreshGitStatus();
  } catch (e) {
    alert('出错: ' + e.message);
  }
}

// ===== Event listeners =====
document.addEventListener('DOMContentLoaded', function() {
  // Git status refresh on cwd change
  cwdInput.addEventListener('change', refreshGitStatus);

  // Git modal tabs
  document.querySelectorAll('.git-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _switchGitTab(btn.dataset.tab);
    });
  });

  // Git action buttons
  if (_ge('gitStageSelectedBtn')) {
    _ge('gitStageSelectedBtn').addEventListener('click', _addSelected);
  }
  if (_ge('gitUnstageSelectedBtn')) {
    _ge('gitUnstageSelectedBtn').addEventListener('click', _unaddSelected);
  }
  if (_ge('gitDiscardSelectedBtn')) {
    _ge('gitDiscardSelectedBtn').addEventListener('click', _discardSelected);
  }
  if (_ge('gitCommitBtn')) {
    _ge('gitCommitBtn').addEventListener('click', function() {
      _showCommitBar();
      var msg = _ge('gitCommitMsgInput') ? _ge('gitCommitMsgInput').value.trim() : '';
      if (msg) {
        _doCommit(msg);
      }
    });
  }
  if (_ge('gitCommitCancelBtn')) {
    _ge('gitCommitCancelBtn').addEventListener('click', _hideCommitBar);
  }
  if (_ge('gitPushBtn')) {
    _ge('gitPushBtn').addEventListener('click', _doPush);
  }
  if (_ge('gitPullBtn')) {
    _ge('gitPullBtn').addEventListener('click', _doPull);
  }

  // Git command buttons
  if (_ge('openGitModalBtn')) {
    _ge('openGitModalBtn').addEventListener('click', openGitModal);
  }
  if (_ge('gitRunBtn')) {
    _ge('gitRunBtn').addEventListener('click', runGitCommand);
  }

  // Git command select: adaptive placeholder
  if (_ge('gitCmdSelect')) {
    _ge('gitCmdSelect').addEventListener('change', function() {
      var val = _ge('gitCmdSelect').value;
      if (val.includes('<file>')) {
        _ge('gitArgInput').placeholder = '文件路径（如 src/main.py）';
      } else if (val.includes('<branch>')) {
        _ge('gitArgInput').placeholder = '分支名（如 develop）';
      } else if (val.includes('<commit>')) {
        _ge('gitArgInput').placeholder = '提交哈希（如 abc1234）';
      } else if (val.includes('<name>')) {
        _ge('gitArgInput').placeholder = '标签名';
      } else if (val.includes('message')) {
        _ge('gitArgInput').placeholder = '提交信息';
      } else {
        _ge('gitArgInput').placeholder = '参数（如分支名、文件路径等）';
      }
    });
  }

  // Enter key in git arg input triggers run
  if (_ge('gitArgInput')) {
    _ge('gitArgInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runGitCommand();
      }
    });
  }

  // Enter key in commit message triggers commit
  if (_ge('gitCommitMsgInput')) {
    _ge('gitCommitMsgInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        _doCommit(_ge('gitCommitMsgInput').value.trim());
      }
      if (e.key === 'Escape') {
        _hideCommitBar();
      }
    });
  }
});
