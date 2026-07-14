export const STEP = 1 / 60;
const MAX_DELTA = 0.08;

export function createGameLoop(update, render) {
  let lastTime = 0;
  let accumulator = 0;
  let running = true;

  function frame(ts) {
    if (!running) return;
    const now = ts / 1000;
    const delta = Math.min(MAX_DELTA, now - (lastTime || now));
    lastTime = now;
    accumulator += delta;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  return {
    start() {
      running = true;
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };
}
