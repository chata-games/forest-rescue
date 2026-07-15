import './style.css';

const status = document.querySelector('#status');
const start = document.querySelector('#start');
const pause = document.querySelector('#pause');
const mana = document.querySelector('#mana');
const target = document.querySelector('.target-card');

document.querySelectorAll('.ring').forEach((ring) => ring.addEventListener('click', () => {
  target.hidden = false;
  status.textContent = 'Ring selected';
  document.querySelectorAll('.ring').forEach((item) => item.classList.remove('active'));
  ring.classList.add('active');
}));

document.querySelectorAll('.action').forEach((action) => action.addEventListener('click', () => {
  document.querySelectorAll('.action').forEach((item) => item.classList.remove('selected'));
  action.classList.add('selected');
  status.textContent = action.dataset.action === 'spell' ? 'Vine burst armed' : action.dataset.action === 'loadout' ? 'Loadout preview' : `${action.textContent.trim()} ready`;
}));

start.addEventListener('click', () => {
  start.textContent = start.textContent === 'START WAVE' ? 'WAVE RUNNING' : 'START WAVE';
  status.textContent = start.textContent === 'WAVE RUNNING' ? 'Defending' : 'Planning';
});

pause.addEventListener('click', () => {
  const paused = pause.getAttribute('aria-pressed') === 'true';
  pause.setAttribute('aria-pressed', String(!paused));
  pause.textContent = paused ? 'Ⅱ' : '▶';
  status.textContent = paused ? 'Planning' : 'Paused';
});

window.addEventListener('keydown', (event) => { if (event.key === 'Escape') target.hidden = true; });
mana.addEventListener('click', () => { mana.textContent = String(Number(mana.textContent) + 10); status.textContent = 'Mana flower collected'; });
