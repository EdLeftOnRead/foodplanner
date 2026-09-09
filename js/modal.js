// modal.js — one generic modal used everywhere (detail view, forms, pickers)

let onCloseCb = null;

export function openModal(node, { onClose, wide } = {}) {
  const root = document.getElementById('modal-root');
  const panel = root.querySelector('.modal__panel');
  panel.innerHTML = '';
  panel.appendChild(node);
  panel.classList.toggle('modal__panel--wide', !!wide);
  root.classList.add('modal--open');
  document.body.classList.add('no-scroll');
  onCloseCb = onClose || null;
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.remove('modal--open');
  document.body.classList.remove('no-scroll');
  const panel = root.querySelector('.modal__panel');
  panel.innerHTML = '';
  if (onCloseCb) onCloseCb();
  onCloseCb = null;
}

export function initModalShell() {
  const root = document.getElementById('modal-root');
  root.addEventListener('click', (e) => {
    if (e.target === root) closeModal();
  });
  root.querySelector('.modal__close').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('modal--open')) closeModal();
  });
}
