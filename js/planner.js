// planner.js — build a day's plan, see running totals against your targets, save it.

import { state, upsertPlan, deletePlan } from './state.js';
import { openModal, closeModal } from './modal.js';
import { escapeHtml, h, uid, fmtNum, todayISO, formatDateLabel } from './utils.js';

let workingPlan = { id: null, name: '', items: [] };

export function initPlanner() {
  document.getElementById('plan-add-food').addEventListener('click', openFoodPicker);
  document.getElementById('plan-new').addEventListener('click', () => {
    workingPlan = { id: null, name: '', items: [] };
    renderPlanner();
  });
  document.getElementById('plan-save').addEventListener('click', savePlan);
}

export function addToWorkingPlan(foodId, qty = 1) {
  const existing = workingPlan.items.find((i) => i.foodId === foodId);
  if (existing) existing.qty += qty;
  else workingPlan.items.push({ foodId, qty });
  renderPlanner();
}

function computeTotals(items) {
  const totals = items.reduce(
    (acc, item) => {
      const food = state.data.foods.find((f) => f.id === item.foodId);
      const n = (food && food.nutrition) || {};
      acc.calories += (n.calories || 0) * item.qty;
      acc.protein += (n.protein || 0) * item.qty;
      acc.carbs += (n.carbs || 0) * item.qty;
      acc.fat += (n.fat || 0) * item.qty;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  totals.missing = items.some((i) => {
    const f = state.data.foods.find((ff) => ff.id === i.foodId);
    return !f || f.nutrition?.calories == null;
  });
  return totals;
}

function macroBar(label, value, target, unit) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target && value > target;
  return `
    <div class="macro">
      <div class="macro__label">
        <span>${label}</span>
        <span>${fmtNum(value, 1)} / ${fmtNum(target)}${unit}</span>
      </div>
      <div class="macro__track">
        <div class="macro__fill ${over ? 'macro__fill--over' : ''}" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

export function renderPlanner() {
  renderWorkingPlan();
  renderSavedPlans();
}

function renderWorkingPlan() {
  const list = document.getElementById('plan-items');
  const nameInput = document.getElementById('plan-name');
  nameInput.value = workingPlan.name;
  list.innerHTML = '';

  if (!workingPlan.items.length) {
    list.innerHTML = '<p class="muted">Nothing planned yet. Add foods from here or from the Browse tab.</p>';
  } else {
    workingPlan.items.forEach((item, idx) => {
      const food = state.data.foods.find((f) => f.id === item.foodId);
      const row = h(`
        <div class="plan-row">
          <span class="plan-row__name">${escapeHtml(food ? food.name : 'Removed food')}</span>
          <input type="number" min="0.25" step="0.25" class="qty-input" value="${item.qty}" />
          <button type="button" class="icon-btn" aria-label="Remove">✕</button>
        </div>
      `);
      row.querySelector('input').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        item.qty = Number.isFinite(v) && v > 0 ? v : 0.25;
        renderWorkingPlan();
      });
      row.querySelector('button').addEventListener('click', () => {
        workingPlan.items.splice(idx, 1);
        renderWorkingPlan();
      });
      list.appendChild(row);
    });
  }

  const totals = computeTotals(workingPlan.items);
  const targets = state.data.settings.dailyTargets;
  document.getElementById('plan-macros').innerHTML =
    macroBar('Calories', totals.calories, targets.calories, ' kcal') +
    macroBar('Protein', totals.protein, targets.protein, 'g') +
    macroBar('Carbs', totals.carbs, targets.carbs, 'g') +
    macroBar('Fat', totals.fat, targets.fat, 'g');

  document.getElementById('plan-missing-note').hidden = !totals.missing || !workingPlan.items.length;
}

function renderSavedPlans() {
  const wrap = document.getElementById('saved-plans');
  wrap.innerHTML = '';
  if (!state.data.plans.length) {
    wrap.innerHTML = '<p class="muted">No saved plans yet.</p>';
    return;
  }
  state.data.plans.forEach((plan) => {
    const totals = computeTotals(plan.items);
    const row = h(`
      <div class="saved-plan">
        <div>
          <strong>${escapeHtml(plan.name)}</strong>
          <span class="muted"> · ${plan.items.length} item${plan.items.length === 1 ? '' : 's'} · ${fmtNum(totals.calories)} kcal</span>
        </div>
        <div class="saved-plan__actions">
          <button type="button" class="btn btn--small" data-action="load">Load</button>
          <button type="button" class="btn btn--small btn--danger" data-action="delete">Delete</button>
        </div>
      </div>
    `);
    row.querySelector('[data-action="load"]').addEventListener('click', () => {
      workingPlan = { id: plan.id, name: plan.name, items: plan.items.map((i) => ({ ...i })) };
      renderPlanner();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Delete plan "${plan.name}"?`)) return;
      await deletePlan(plan.id);
      renderSavedPlans();
    });
    wrap.appendChild(row);
  });
}

async function savePlan() {
  const nameInput = document.getElementById('plan-name');
  const name = nameInput.value.trim() || formatDateLabel(todayISO());
  if (!workingPlan.items.length) return;
  const plan = {
    id: workingPlan.id || uid(),
    name,
    date: todayISO(),
    items: workingPlan.items,
  };
  await upsertPlan(plan);
  workingPlan.id = plan.id;
  workingPlan.name = name;
  renderSavedPlans();
}

// ---------------- quick food picker ----------------

function openFoodPicker() {
  const node = h(`
    <div class="picker">
      <h2>Add food to plan</h2>
      <input type="text" class="picker__search" placeholder="Search foods…" />
      <div class="picker__list"></div>
      <div class="form-actions">
        <button type="button" class="btn btn--primary" id="picker-done">Done</button>
      </div>
    </div>
  `);
  const listEl = node.querySelector('.picker__list');
  const searchEl = node.querySelector('.picker__search');

  function renderList() {
    const term = searchEl.value.trim().toLowerCase();
    const foods = state.data.foods
      .filter((f) => (term ? f.name.toLowerCase().includes(term) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
    listEl.innerHTML = '';
    if (!foods.length) {
      listEl.innerHTML = '<p class="muted">No foods match.</p>';
      return;
    }
    foods.forEach((food) => {
      const item = h(`
        <button type="button" class="picker__item">
          <span>${escapeHtml(food.name)}</span>
          <span class="picker__add">+ Add</span>
        </button>
      `);
      item.addEventListener('click', () => {
        addToWorkingPlan(food.id, 1);
        item.querySelector('.picker__add').textContent = 'Added ✓';
        setTimeout(() => {
          item.querySelector('.picker__add').textContent = '+ Add';
        }, 900);
      });
      listEl.appendChild(item);
    });
  }
  searchEl.addEventListener('input', renderList);
  renderList();

  node.querySelector('#picker-done').addEventListener('click', closeModal);
  openModal(node);
  searchEl.focus();
}
