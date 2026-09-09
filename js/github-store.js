// github-store.js — talks to the GitHub Contents API so the repo IS the database.
// Everything here runs in the user's browser; the token never leaves this device
// except in requests to api.github.com.

import { utf8ToBase64, base64ToUtf8, uid } from './utils.js';

const CONFIG_KEY = 'larder_github_config';

export const DEFAULT_DATA = {
  version: 1,
  foods: [],
  tags: [
    { id: 'quick', name: 'Quick', color: '#5B7B4F' },
    { id: 'protein', name: 'Protein', color: '#A85C32' },
  ],
  plans: [],
  settings: {
    dailyTargets: { calories: 2000, protein: 150, carbs: 225, fat: 70 },
  },
};

export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function apiBase(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;
}

function authHeaders(cfg, extra = {}) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

async function parseError(res) {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body && body.message) msg = body.message;
  } catch {
    /* ignore */
  }
  return msg;
}

/** Verifies owner/repo/token actually work together. */
export async function testConnection(cfg) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
    headers: authHeaders(cfg),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const repo = await res.json();
  return { defaultBranch: repo.default_branch || 'main', private: repo.private };
}

/**
 * Loads data.json. If it doesn't exist yet, creates it with the default
 * template so a brand-new empty repo "just works".
 */
export async function loadData(cfg) {
  const url = `${apiBase(cfg)}/data.json?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: authHeaders(cfg) });

  if (res.status === 404) {
    const created = await saveData(cfg, DEFAULT_DATA, null, 'Initialize Larder data file');
    return { data: DEFAULT_DATA, sha: created.sha };
  }
  if (!res.ok) throw new Error(await parseError(res));

  const body = await res.json();
  const json = JSON.parse(base64ToUtf8(body.content));
  return { data: json, sha: body.sha };
}

/**
 * Writes data.json back. Pass the sha you last read (or null when creating).
 * Returns the new sha so the caller can keep it for the next write.
 */
export async function saveData(cfg, data, sha, message = 'Update Larder data') {
  const url = `${apiBase(cfg)}/data.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error('Sync conflict — reload Larder and try again.');
    throw new Error(await parseError(res));
  }
  const body = await res.json();
  return { sha: body.content.sha };
}

/**
 * Uploads an image as a brand-new file (never overwrites), so we never need
 * to juggle a sha for it. Returns the repo-relative path.
 */
export async function uploadImage(cfg, base64Content, extension = 'jpg') {
  const path = `images/${uid()}.${extension}`;
  const res = await fetch(`${apiBase(cfg)}/${path}`, {
    method: 'PUT',
    headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message: 'Add food image',
      content: base64Content,
      branch: cfg.branch,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return path;
}

const imageCache = new Map(); // path -> blob object URL, cached for this session

/** Fetches an image (works for private repos too) and returns a blob: URL. */
export async function getImageUrl(cfg, path) {
  if (!path) return null;
  if (imageCache.has(path)) return imageCache.get(path);
  const res = await fetch(`${apiBase(cfg)}/${path}?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: authHeaders(cfg, { Accept: 'application/vnd.github.raw' }),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  imageCache.set(path, url);
  return url;
}
