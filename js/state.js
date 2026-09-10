// state.js — single in-memory copy of data.json, plus every mutation the UI needs.
// Edits only touch memory (and a local draft, as a safety net) until saveNow()
// pushes everything back to GitHub as one commit.

import * as store from './github-store.js';
import { uid, toast } from './utils.js';

export const state = {
  cfg: null,
  data: null,
  sha: null,
  connected: false,
  loading: false,
  dirty: false,
  saving: false,
  version: 0,
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

// ---------------- local draft (survives a refresh before you hit Save) ----------------

function draftKey(cfg) {
  return `larder_draft_${cfg.owner}/${cfg.repo}`;
}
function persistDraft() {
  if (!state.cfg) return;
  try {
    localStorage.setItem(draftKey(state.cfg), JSON.stringify({ baseSha: state.sha, data: state.data }));
  } catch {
    /* storage full/unavailable — draft is best-effort only */
  }
}
function readDraft(cfg) {
  try {
    const raw = localStorage.getItem(draftKey(cfg));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearDraft() {
  if (!state.cfg) return;
  try {
    localStorage.removeItem(draftKey(state.cfg));
  } catch {
    /* ignore */
  }
}

function markDirty() {
  state.dirty = true;
  state.version += 1;
  persistDraft();
  notify();
}

export async function connect(cfg) {
  const { defaultBranch } = await store.testConnection(cfg);
  const finalCfg = { ...cfg, branch: cfg.branch || defaultBranch };
  store.setConfig(finalCfg);
  state.cfg = finalCfg;
  await reload();
  return finalCfg;
}

export function disconnect() {
  clearDraft();
  store.clearConfig();
  state.cfg = null;
  state.data = null;
  state.sha = null;
  state.connected = false;
  state.dirty = false;
  notify();
}

export async function tryAutoConnect() {
  const cfg = store.getConfig();
  if (!cfg) return false;
  state.cfg = cfg;
  await reload();
  return true;
}

export async function reload() {
  state.loading = true;
  notify();
  try {
    const { data, sha } = await store.loadData(state.cfg);
    const draft = readDraft(state.cfg);
    state.connected = true;
    if (draft && draft.baseSha === sha) {
      // Picking back up where a previous unsaved session left off.
      state.data = draft.data;
      state.sha = sha;
      state.dirty = true;
    } else {
      if (draft) {
        clearDraft();
        toast('Discarded unsaved local changes — the repo was updated elsewhere since then.', 'error');
      }
      state.data = migrateData(data);
      state.sha = sha;
      state.dirty = false;
    }
  } finally {
    state.loading = false;
    notify();
  }
}

/** Pushes everything staged in memory back to GitHub as a single commit. */
export async function saveNow() {
  if (!state.dirty || state.saving) return;
  state.saving = true;
  notify();
  const versionAtSave = state.version;
  try {
    const { sha } = await store.saveData(state.cfg, state.data, state.sha, 'Update Larder data');
    state.sha = sha;
    if (state.version === versionAtSave) {
      state.dirty = false;
      clearDraft();
    } else {
      // More edits landed while this save was in flight — still unsaved.
      persistDraft();
    }
    toast('Saved to GitHub.', 'success');
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  } finally {
    state.saving = false;
    notify();
  }
}

function migrateData(data) {
  return {
    version: 1,
    foods: data.foods || [],
    tags: data.tags || [],
    plans: data.plans || [],
    settings: {
      dailyTargets: {
        calories: 2000,
        protein: 150,
        carbs: 225,
        fat: 70,
        ...(data.settings && data.settings.dailyTargets),
      },
    },
  };
}

// ---------------- Foods ----------------

export function upsertFood(food) {
  const now = new Date().toISOString();
  const idx = state.data.foods.findIndex((f) => f.id === food.id);
  if (idx === -1) {
    state.data.foods.push({ ...food, id: food.id || uid(), createdAt: now, updatedAt: now });
  } else {
    state.data.foods[idx] = { ...state.data.foods[idx], ...food, updatedAt: now };
  }
  markDirty();
}

export function deleteFood(id) {
  state.data.foods = state.data.foods.filter((f) => f.id !== id);
  state.data.plans.forEach((p) => {
    p.items = p.items.filter((i) => i.foodId !== id);
  });
  markDirty();
}

// ---------------- Tags ----------------

export function upsertTag(tag) {
  const idx = state.data.tags.findIndex((t) => t.id === tag.id);
  if (idx === -1) state.data.tags.push({ ...tag, id: tag.id || uid() });
  else state.data.tags[idx] = { ...state.data.tags[idx], ...tag };
  markDirty();
}

export function deleteTag(id) {
  state.data.tags = state.data.tags.filter((t) => t.id !== id);
  state.data.foods.forEach((f) => {
    f.tags = (f.tags || []).filter((t) => t !== id);
  });
  markDirty();
}

// ---------------- Plans ----------------

export function upsertPlan(plan) {
  const now = new Date().toISOString();
  const idx = state.data.plans.findIndex((p) => p.id === plan.id);
  if (idx === -1) {
    state.data.plans.unshift({ ...plan, id: plan.id || uid(), createdAt: now, updatedAt: now });
  } else {
    state.data.plans[idx] = { ...state.data.plans[idx], ...plan, updatedAt: now };
  }
  markDirty();
}

export function deletePlan(id) {
  state.data.plans = state.data.plans.filter((p) => p.id !== id);
  markDirty();
}

// ---------------- Settings ----------------

export function updateTargets(targets) {
  state.data.settings.dailyTargets = { ...state.data.settings.dailyTargets, ...targets };
  markDirty();
}
