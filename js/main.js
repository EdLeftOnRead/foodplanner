// main.js — wires the tabs together and decides whether to show the
// "connect to GitHub" gate or the app itself.

import { tryAutoConnect } from './state.js';
import { initModalShell } from './modal.js';
import { initBrowse, renderBrowse } from './browse.js';
import { initPlanner, renderPlanner } from './planner.js';
import { initSettings, renderSettings, buildConnectionForm } from './settings.js';
import { toast } from './utils.js';

const VIEWS = { browse: 'view-browse', planner: 'view-planner', settings: 'view-settings' };

function switchTab(tab) {
  Object.entries(VIEWS).forEach(([key, id]) => {
    document.getElementById(id).hidden = key !== tab;
  });
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('tab--active', btn.dataset.tab === tab);
  });
  if (tab === 'settings') renderSettings();
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function showApp() {
  document.getElementById('connect-gate').hidden = true;
  document.getElementById('app-shell').hidden = false;
  renderBrowse();
  renderPlanner();
}

async function safeAutoConnect() {
  try {
    return await tryAutoConnect();
  } catch (err) {
    toast(`Could not reconnect: ${err.message}`, 'error');
    return false;
  }
}

async function boot() {
  initModalShell();
  initTabs();
  initBrowse();
  initPlanner();
  initSettings();

  const connected = await safeAutoConnect();
  document.getElementById('gate-loading').hidden = true;
  if (connected) {
    showApp();
  } else {
    document.getElementById('gate-form-mount').appendChild(buildConnectionForm({ onConnected: showApp }));
  }
}

boot();
