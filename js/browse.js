// browse.js — the main "look at my foods" tab: grid, search, tag filters,
// the detail view, and the add/edit form.

import { state, upsertFood, deleteFood, upsertTag } from './state.js';
import * as store from './github-store.js';
import { openModal, closeModal } from './modal.js';
import { escapeHtml, h, uid, toast, fmtNum, resizeImageFile, TAG_COLORS } from './utils.js';
import { addToWorkingPlan } from './planner.js';

let searchTerm = '';
let activeTags = new Set();

export function initBrowse() {
  const searchInput = document.getElementById('food-search');
  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    renderGrid();
  });
  document.getElementById('add-food-btn').addEventListener('click', () => openFoodForm());
}

export function renderBrowse() {
  renderTagFilters();
  renderGrid();
}

function getFilteredFoods() {
  return state.data.foods
    .filter((f) => (searchTerm ? f.name.toLowerCase().includes(searchTerm) : true))
    .filter((f) => (activeTags.size ? (f.tags || []).some((t) => activeTags.has(t)) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderTagFilters() {
  const wrap = document.getElementById('tag-filters');
  wrap.innerHTML = '';
  if (!state.data.tags.length) return;
  state.data.tags.forEach((tag) => {
    const btn = h(`
      <button class="chip ${activeTags.has(tag.id) ? 'chip--active' : ''}" style="--chip-color:${tag.color}">
        ${escapeHtml(tag.name)}
      </button>
    `);
    btn.addEventListener('click', () => {
      if (activeTags.has(tag.id)) activeTags.delete(tag.id);
      else activeTags.add(tag.id);
      renderBrowse();
    });
    wrap.appendChild(btn);
  });
}

function tagPillsHtml(tagIds) {
  return (tagIds || [])
    .map((id) => state.data.tags.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => `<span class="pill" style="--chip-color:${t.color}">${escapeHtml(t.name)}</span>`)
    .join('');
}

function renderGrid() {
  const grid = document.getElementById('food-grid');
  const empty = document.getElementById('food-empty');
  const foods = getFilteredFoods();

  grid.innerHTML = '';
  if (!foods.length) {
    empty.hidden = false;
    empty.textContent = state.data.foods.length
      ? 'Nothing matches that search or filter.'
      : "Your larder's empty. Add the first thing you actually like eating.";
    return;
  }
  empty.hidden = true;

  foods.forEach((food) => {
    const card = h(`
      <article class="food-card" tabindex="0" role="button" aria-label="${escapeHtml(food.name)}">
        <div class="food-card__media">
          <div class="food-card__placeholder">${food.type === 'dish' ? '🍽' : '🥕'}</div>
          <img class="food-card__img" alt="" hidden />
        </div>
        <div class="food-card__body">
          <h3 class="food-card__name">${escapeHtml(food.name)}</h3>
          <div class="food-card__tags">${tagPillsHtml(food.tags)}</div>
        </div>
      </article>
    `);
    card.addEventListener('click', () => openFoodDetail(food.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFoodDetail(food.id);
      }
    });
    grid.appendChild(card);

    if (food.image) {
      store.getImageUrl(state.cfg, food.image).then((url) => {
        if (!url) return;
        const img = card.querySelector('.food-card__img');
        const ph = card.querySelector('.food-card__placeholder');
        img.src = url;
        img.hidden = false;
        ph.hidden = true;
      });
    }
  });
}

// ---------------- Detail view ----------------

function nutritionRow(label, value, unit) {
  if (value == null || value === '') return '';
  return `<div class="nutri-row"><span>${label}</span><strong>${fmtNum(value)}${unit}</strong></div>`;
}

function openFoodDetail(id) {
  const food = state.data.foods.find((f) => f.id === id);
  if (!food) return;
  const n = food.nutrition || {};

  const node = h(`
    <div class="detail">
      <div class="detail__media">
        <div class="detail__placeholder">${food.type === 'dish' ? '🍽' : '🥕'}</div>
        <img class="detail__img" alt="" hidden />
      </div>
      <div class="detail__body">
        <span class="badge">${food.type === 'dish' ? 'Dish' : 'Ingredient'}</span>
        <h2 class="detail__name">${escapeHtml(food.name)}</h2>
        <div class="detail__tags">${tagPillsHtml(food.tags)}</div>
        ${food.notes ? `<p class="detail__notes">${escapeHtml(food.notes)}</p>` : ''}
        ${
          food.ingredients && food.ingredients.length
            ? `<div class="detail__section">
                 <h4>Ingredients</h4>
                 <ul class="detail__ingredients">
                   ${food.ingredients.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
                 </ul>
               </div>`
            : ''
        }
        ${
          n.calories != null || n.protein != null || n.carbs != null || n.fat != null
            ? `<div class="detail__section">
                 <h4>Nutrition${food.serving && food.serving.label ? ` — ${escapeHtml(food.serving.label)}` : ''}</h4>
                 <div class="nutri-grid">
                   ${nutritionRow('Calories', n.calories, ' kcal')}
                   ${nutritionRow('Protein', n.protein, 'g')}
                   ${nutritionRow('Carbs', n.carbs, 'g')}
                   ${nutritionRow('Fat', n.fat, 'g')}
                 </div>
               </div>`
            : `<p class="detail__hint">No nutrition info yet — edit this to add it.</p>`
        }

        <div class="detail__section detail__plan-add">
          <h4>Add to plan</h4>
          <div class="qty-row">
            <input type="number" min="0.25" step="0.25" value="1" class="qty-input" id="detail-qty" />
            <button class="btn btn--primary" id="detail-add-plan">Add</button>
          </div>
        </div>

        <div class="detail__actions">
          <button class="btn" id="detail-edit">Edit</button>
          <button class="btn btn--danger" id="detail-delete">Delete</button>
        </div>
      </div>
    </div>
  `);

  node.querySelector('#detail-add-plan').addEventListener('click', () => {
    const qty = parseFloat(node.querySelector('#detail-qty').value) || 1;
    addToWorkingPlan(food.id, qty);
    toast(`Added ${qty}× ${food.name} to today's plan.`, 'success');
  });
  node.querySelector('#detail-edit').addEventListener('click', () => openFoodForm(food));
  node.querySelector('#detail-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${food.name}" for good?`)) return;
    await deleteFood(food.id);
    closeModal();
    renderBrowse();
  });

  openModal(node, { wide: true });

  if (food.image) {
    store.getImageUrl(state.cfg, food.image).then((url) => {
      if (!url) return;
      const img = node.querySelector('.detail__img');
      const ph = node.querySelector('.detail__placeholder');
      img.src = url;
      img.hidden = false;
      ph.hidden = true;
    });
  }
}

// ---------------- Add / edit form ----------------

function openFoodForm(existing) {
  const isEdit = !!existing;
  const food = existing || {
    id: null,
    name: '',
    type: 'ingredient',
    image: null,
    tags: [],
    notes: '',
    ingredients: [],
    serving: { label: '' },
    nutrition: {},
  };
  let pendingImageBase64 = null; // set if the user picked a new photo
  const selectedTags = new Set(food.tags || []);
  let ingredients = [...(food.ingredients || [])];

  const node = h(`
    <form class="food-form">
      <h2>${isEdit ? 'Edit food' : 'Add a food'}</h2>

      <label class="field">
        <span>Name</span>
        <input type="text" name="name" required value="${escapeHtml(food.name)}" placeholder="e.g. Chicken burrito" />
      </label>

      <div class="field field--row">
        <label class="radio"><input type="radio" name="type" value="ingredient" ${food.type !== 'dish' ? 'checked' : ''}/> Ingredient</label>
        <label class="radio"><input type="radio" name="type" value="dish" ${food.type === 'dish' ? 'checked' : ''}/> Dish</label>
      </div>

      <label class="field">
        <span>Photo</span>
        <input type="file" accept="image/*" name="image" />
        <div class="image-preview" id="image-preview" ${food.image || '' ? '' : 'hidden'}>
          <img id="image-preview-img" alt="" />
        </div>
      </label>

      <div class="field">
        <span>Tags</span>
        <div class="tag-picker" id="tag-picker"></div>
        <button type="button" class="link-btn" id="new-tag-toggle">+ New tag</button>
        <div class="new-tag-form" id="new-tag-form" hidden>
          <input type="text" id="new-tag-name" placeholder="Tag name" maxlength="24" />
          <div class="swatches" id="new-tag-swatches"></div>
          <button type="button" class="btn btn--small" id="new-tag-save">Add tag</button>
        </div>
      </div>

      <div class="field ingredients-field" id="ingredients-field">
        <span>Ingredients</span>
        <div id="ingredient-rows"></div>
        <button type="button" class="link-btn" id="add-ingredient">+ Add ingredient</button>
      </div>

      <label class="field">
        <span>Serving size (for nutrition below)</span>
        <input type="text" name="servingLabel" value="${escapeHtml((food.serving && food.serving.label) || '')}" placeholder="e.g. 1 burrito (350g)" />
      </label>

      <div class="field field--grid4">
        <label>Calories<input type="number" min="0" step="1" name="calories" value="${food.nutrition?.calories ?? ''}" /></label>
        <label>Protein (g)<input type="number" min="0" step="0.1" name="protein" value="${food.nutrition?.protein ?? ''}" /></label>
        <label>Carbs (g)<input type="number" min="0" step="0.1" name="carbs" value="${food.nutrition?.carbs ?? ''}" /></label>
        <label>Fat (g)<input type="number" min="0" step="0.1" name="fat" value="${food.nutrition?.fat ?? ''}" /></label>
      </div>

      <label class="field">
        <span>Notes</span>
        <textarea name="notes" rows="3" placeholder="Anything worth remembering — where you get it, how you make it, when you crave it...">${escapeHtml(food.notes || '')}</textarea>
      </label>

      <div class="form-actions">
        <button type="button" class="btn" id="cancel-form">Cancel</button>
        <button type="submit" class="btn btn--primary" id="save-form">${isEdit ? 'Save changes' : 'Add food'}</button>
      </div>
    </form>
  `);

  // --- ingredients section visibility + rows ---
  function refreshIngredientsVisibility() {
    const type = node.querySelector('input[name="type"]:checked').value;
    node.querySelector('#ingredients-field').hidden = type !== 'dish';
  }
  node.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', refreshIngredientsVisibility));
  refreshIngredientsVisibility();

  function renderIngredientRows() {
    const wrap = node.querySelector('#ingredient-rows');
    wrap.innerHTML = '';
    ingredients.forEach((val, i) => {
      const row = h(`
        <div class="ingredient-row">
          <input type="text" value="${escapeHtml(val)}" />
          <button type="button" class="icon-btn" aria-label="Remove">✕</button>
        </div>
      `);
      row.querySelector('input').addEventListener('input', (e) => {
        ingredients[i] = e.target.value;
      });
      row.querySelector('button').addEventListener('click', () => {
        ingredients.splice(i, 1);
        renderIngredientRows();
      });
      wrap.appendChild(row);
    });
  }
  renderIngredientRows();
  node.querySelector('#add-ingredient').addEventListener('click', () => {
    ingredients.push('');
    renderIngredientRows();
    node.querySelector('#ingredient-rows').lastElementChild.querySelector('input').focus();
  });

  // --- image preview ---
  if (food.image) {
    store.getImageUrl(state.cfg, food.image).then((url) => {
      if (url) node.querySelector('#image-preview-img').src = url;
    });
  }
  node.querySelector('input[name="image"]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previewImg = node.querySelector('#image-preview-img');
    const previewWrap = node.querySelector('#image-preview');
    resizeImageFile(file)
      .then((b64) => {
        pendingImageBase64 = b64;
        previewImg.src = `data:image/jpeg;base64,${b64}`;
        previewWrap.hidden = false;
      })
      .catch((err) => toast(err.message, 'error'));
  });

  // --- tag picker ---
  function renderTagPicker() {
    const wrap = node.querySelector('#tag-picker');
    wrap.innerHTML = '';
    if (!state.data.tags.length) {
      wrap.innerHTML = '<span class="muted">No tags yet — create one below.</span>';
      return;
    }
    state.data.tags.forEach((tag) => {
      const btn = h(`
        <button type="button" class="chip ${selectedTags.has(tag.id) ? 'chip--active' : ''}" style="--chip-color:${tag.color}">
          ${escapeHtml(tag.name)}
        </button>
      `);
      btn.addEventListener('click', () => {
        if (selectedTags.has(tag.id)) selectedTags.delete(tag.id);
        else selectedTags.add(tag.id);
        renderTagPicker();
      });
      wrap.appendChild(btn);
    });
  }
  renderTagPicker();

  // --- inline "new tag" mini-form ---
  const swatchWrap = node.querySelector('#new-tag-swatches');
  let chosenColor = TAG_COLORS[state.data.tags.length % TAG_COLORS.length].hex;
  TAG_COLORS.forEach((c) => {
    const dot = h(`<button type="button" class="swatch ${c.hex === chosenColor ? 'swatch--active' : ''}" style="--sw:${c.hex}"></button>`);
    dot.addEventListener('click', () => {
      chosenColor = c.hex;
      swatchWrap.querySelectorAll('.swatch').forEach((s) => s.classList.remove('swatch--active'));
      dot.classList.add('swatch--active');
    });
    swatchWrap.appendChild(dot);
  });
  node.querySelector('#new-tag-toggle').addEventListener('click', () => {
    node.querySelector('#new-tag-form').hidden = false;
    node.querySelector('#new-tag-toggle').hidden = true;
    node.querySelector('#new-tag-name').focus();
  });
  node.querySelector('#new-tag-save').addEventListener('click', async () => {
    const nameInput = node.querySelector('#new-tag-name');
    const name = nameInput.value.trim();
    if (!name) return;
    const tag = { id: uid(), name, color: chosenColor };
    await upsertTag(tag);
    selectedTags.add(tag.id);
    nameInput.value = '';
    node.querySelector('#new-tag-form').hidden = true;
    node.querySelector('#new-tag-toggle').hidden = false;
    renderTagPicker();
  });

  node.querySelector('#cancel-form').addEventListener('click', closeModal);

  node.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(node);
    const name = fd.get('name').trim();
    if (!name) return;

    const saveBtn = node.querySelector('#save-form');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      let imagePath = food.image || null;
      if (pendingImageBase64) {
        imagePath = await store.uploadImage(state.cfg, pendingImageBase64, 'jpg');
      }
      const num = (v) => (v === '' || v == null ? undefined : parseFloat(v));
      const payload = {
        id: food.id,
        name,
        type: fd.get('type'),
        image: imagePath,
        tags: [...selectedTags],
        notes: fd.get('notes').trim(),
        ingredients: fd.get('type') === 'dish' ? ingredients.map((i) => i.trim()).filter(Boolean) : [],
        serving: { label: fd.get('servingLabel').trim() },
        nutrition: {
          calories: num(fd.get('calories')),
          protein: num(fd.get('protein')),
          carbs: num(fd.get('carbs')),
          fat: num(fd.get('fat')),
        },
      };
      await upsertFood(payload);
      closeModal();
      renderBrowse();
    } catch (err) {
      toast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save changes' : 'Add food';
    }
  });

  openModal(node, { wide: true });
}
