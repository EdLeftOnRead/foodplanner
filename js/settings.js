// settings.js — GitHub connection (shared with the first-run gate), daily
// nutrition targets, and tag management.

import { state, connect, disconnect, upsertTag, deleteTag, updateTargets } from './state.js';
import { h, escapeHtml, uid, toast, TAG_COLORS } from './utils.js';

export function buildConnectionForm({ onConnected } = {}) {
  const cfg = state.cfg || {};
  const node = h(`
    <form class="connect-form">
      <label class="field">
        <span>Repo owner (your GitHub username)</span>
        <input type="text" name="owner" required value="${escapeHtml(cfg.owner || '')}" placeholder="e.g. jane-doe" />
      </label>
      <label class="field">
        <span>Repository name</span>
        <input type="text" name="repo" required value="${escapeHtml(cfg.repo || '')}" placeholder="e.g. larder" />
      </label>
      <label class="field">
        <span>Branch</span>
        <input type="text" name="branch" value="${escapeHtml(cfg.branch || 'main')}" placeholder="main" />
      </label>
      <label class="field">
        <span>Personal access token</span>
        <input type="password" name="token" required value="${escapeHtml(cfg.token || '')}" placeholder="fine-grained token, Contents: read & write" />
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary" id="connect-submit">Connect</button>
      </div>
      <p class="connect-status" id="connect-status"></p>
    </form>
  `);

  node.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(node);
    const newCfg = {
      owner: fd.get('owner').trim(),
      repo: fd.get('repo').trim(),
      branch: fd.get('branch').trim() || 'main',
      token: fd.get('token').trim(),
    };
    const btn = node.querySelector('#connect-submit');
    const status = node.querySelector('#connect-status');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    status.textContent = '';
    status.className = 'connect-status';
    try {
      await connect(newCfg);
      status.textContent = 'Connected.';
      status.classList.add('connect-status--ok');
      toast('Connected to GitHub.', 'success');
      if (onConnected) onConnected();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('connect-status--error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });

  return node;
}

export function initSettings() {
  document.getElementById('targets-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await updateTargets({
      calories: parseFloat(fd.get('calories')) || 0,
      protein: parseFloat(fd.get('protein')) || 0,
      carbs: parseFloat(fd.get('carbs')) || 0,
      fat: parseFloat(fd.get('fat')) || 0,
    });
  });

  document.getElementById('add-tag-btn').addEventListener('click', () => openNewTagRow());
  document.getElementById('disconnect-btn').addEventListener('click', () => {
    if (!confirm('Forget this GitHub connection on this device? Your data stays in the repo.')) return;
    disconnect();
    window.location.reload();
  });
}

export function renderSettings() {
  // connection panel
  const connWrap = document.getElementById('settings-connection');
  connWrap.innerHTML = '';
  connWrap.appendChild(buildConnectionForm());
  document.getElementById('connection-summary').textContent = state.cfg
    ? `Connected to ${state.cfg.owner}/${state.cfg.repo} (${state.cfg.branch})`
    : 'Not connected.';

  // targets
  const t = state.data.settings.dailyTargets;
  const form = document.getElementById('targets-form');
  form.calories.value = t.calories;
  form.protein.value = t.protein;
  form.carbs.value = t.carbs;
  form.fat.value = t.fat;

  renderTagList();
}

function renderTagList() {
  const wrap = document.getElementById('tag-list');
  wrap.innerHTML = '';
  if (!state.data.tags.length) {
    wrap.innerHTML = '<p class="muted">No tags yet.</p>';
  }
  state.data.tags.forEach((tag) => {
    const usedBy = state.data.foods.filter((f) => (f.tags || []).includes(tag.id)).length;
    const row = h(`
      <div class="tag-row">
        <span class="tag-row__dot" style="--sw:${tag.color}"></span>
        <input type="text" class="tag-row__name" value="${escapeHtml(tag.name)}" />
        <span class="muted">${usedBy} food${usedBy === 1 ? '' : 's'}</span>
        <button type="button" class="icon-btn" aria-label="Delete tag">✕</button>
      </div>
    `);
    const nameInput = row.querySelector('.tag-row__name');
    nameInput.addEventListener('change', async () => {
      const name = nameInput.value.trim();
      if (!name || name === tag.name) return;
      await upsertTag({ ...tag, name });
      renderTagList();
    });
    row.querySelector('.icon-btn').addEventListener('click', async () => {
      if (!confirm(`Delete tag "${tag.name}"? It'll be removed from ${usedBy} food${usedBy === 1 ? '' : 's'}.`)) return;
      await deleteTag(tag.id);
      renderTagList();
    });
    wrap.appendChild(row);
  });
}

function openNewTagRow() {
  const wrap = document.getElementById('tag-list');
  let chosenColor = TAG_COLORS[state.data.tags.length % TAG_COLORS.length].hex;
  const row = h(`
    <div class="tag-row tag-row--new">
      <input type="text" class="tag-row__name" placeholder="New tag name" />
      <div class="swatches"></div>
      <button type="button" class="btn btn--small">Add</button>
    </div>
  `);
  const swatchWrap = row.querySelector('.swatches');
  TAG_COLORS.forEach((c) => {
    const dot = h(`<button type="button" class="swatch ${c.hex === chosenColor ? 'swatch--active' : ''}" style="--sw:${c.hex}"></button>`);
    dot.addEventListener('click', () => {
      chosenColor = c.hex;
      swatchWrap.querySelectorAll('.swatch').forEach((s) => s.classList.remove('swatch--active'));
      dot.classList.add('swatch--active');
    });
    swatchWrap.appendChild(dot);
  });
  row.querySelector('.btn').addEventListener('click', async () => {
    const name = row.querySelector('.tag-row__name').value.trim();
    if (!name) return;
    await upsertTag({ id: uid(), name, color: chosenColor });
    renderTagList();
  });
  wrap.prepend(row);
  row.querySelector('.tag-row__name').focus();
}
