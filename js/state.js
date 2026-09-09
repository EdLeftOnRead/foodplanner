// state.js — single in-memory copy of data.json, plus every mutation the UI needs.
// Writes are serialized through one queue so two quick edits can't race each other.

import * as store from './github-store.js';
import { uid, toast } from './utils.js';

export const state = {
  cfg: null,
  data: null,
  sha: null,
  connected: false,
  loading: false,
};

let writeQueue = Promise.resolve();

function queueWrite(message) {
  // Chain off the previous write, but never let a prior failure poison the
  // queue for writes that come after it.
  const attempt = writeQueue
    .catch(() => {})
    .then(() => store.saveData(state.cfg, state.data, state.sha, message))
    .then(({ sha }) => {
      state.sha = sha;
    });
  writeQueue = attempt.catch(() => {});
  return attempt.catch((err) => {
    toast(`Sync failed: ${err.message}`, 'error');
    throw err;
  });
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
  store.clearConfig();
  state.cfg = null;
  state.data = null;
  state.sha = null;
  state.connected = false;
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
  try {
    const { data, sha } = await store.loadData(state.cfg);
    state.data = migrateData(data);
    state.sha = sha;
    state.connected = true;
  } finally {
    state.loading = false;
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

export function upsertFood(food, { silent } = {}) {
  const now = new Date().toISOString();
  const idx = state.data.foods.findIndex((f) => f.id === food.id);
  if (idx === -1) {
    state.data.foods.push({ ...food, id: food.id || uid(), createdAt: now, updatedAt: now });
  } else {
    state.data.foods[idx] = { ...state.data.foods[idx], ...food, updatedAt: now };
  }
  return queueWrite(idx === -1 ? `Add food: ${food.name}` : `Update food: ${food.name}`).then(() => {
    if (!silent) toast('Saved.', 'success');
  });
}

export function deleteFood(id) {
  const food = state.data.foods.find((f) => f.id === id);
  state.data.foods = state.data.foods.filter((f) => f.id !== id);
  state.data.plans.forEach((p) => {
    p.items = p.items.filter((i) => i.foodId !== id);
  });
  return queueWrite(`Delete food: ${food ? food.name : id}`).then(() => toast('Deleted.', 'success'));
}

// ---------------- Tags ----------------

export function upsertTag(tag) {
  const idx = state.data.tags.findIndex((t) => t.id === tag.id);
  if (idx === -1) state.data.tags.push({ ...tag, id: tag.id || uid() });
  else state.data.tags[idx] = { ...state.data.tags[idx], ...tag };
  return queueWrite(`Update tag: ${tag.name}`).then(() => toast('Tag saved.', 'success'));
}

export function deleteTag(id) {
  state.data.tags = state.data.tags.filter((t) => t.id !== id);
  state.data.foods.forEach((f) => {
    f.tags = (f.tags || []).filter((t) => t !== id);
  });
  return queueWrite('Delete tag').then(() => toast('Tag deleted.', 'success'));
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
  return queueWrite(`Save plan: ${plan.name}`).then(() => toast('Plan saved.', 'success'));
}

export function deletePlan(id) {
  state.data.plans = state.data.plans.filter((p) => p.id !== id);
  return queueWrite('Delete plan').then(() => toast('Plan deleted.', 'success'));
}

// ---------------- Settings ----------------

export function updateTargets(targets) {
  state.data.settings.dailyTargets = { ...state.data.settings.dailyTargets, ...targets };
  return queueWrite('Update daily targets').then(() => toast('Targets saved.', 'success'));
}
