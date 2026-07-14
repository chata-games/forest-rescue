import Phaser from 'phaser';
import atlasImageUrl from '../../../assets/atlases/units.png?url';
import atlasDataUrl from './units.phaser.json?url';
import { DiagnosticsModel, type DeviceOrientation, type DiagnosticState } from './domain/diagnostics';
import './style.css';

interface MovingUnit {
  sprite: Phaser.GameObjects.Sprite;
  xRatio: number;
  yRatio: number;
  amplitude: number;
  phase: number;
  speed: number;
}

declare global {
  interface Window {
    __forestRescueProof: {
      snapshot: () => DiagnosticState;
      startPerformance: (durationMs?: number) => void;
      testAudio: () => Promise<void>;
    };
  }
}

const currentOrientation = (): DeviceOrientation =>
  window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';

const model = new DiagnosticsModel(currentOrientation());
let activeScene: ProofScene | null = null;

class ProofScene extends Phaser.Scene {
  private units: MovingUnit[] = [];
  private effects: MovingUnit[] = [];
  private guides!: Phaser.GameObjects.Graphics;

  constructor() {
    super('proof');
  }

  preload(): void {
    this.load.atlas('units', atlasImageUrl, atlasDataUrl);
  }

  create(): void {
    activeScene = this;
    const frames = this.textures.get('units').getFrameNames().filter((frame) => frame !== '__BASE');
    this.guides = this.add.graphics().setDepth(100);
    this.createUnits(frames, 140, false);
    this.createUnits(frames, 44, true);
    this.drawGuides();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      model.pointerDown(pointer.id, pointer.x < this.scale.width / 2 ? 'left' : 'right');
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      model.pointerUp(pointer.id, pointer.wasCanceled);
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      model.pointerUp(pointer.id, pointer.wasCanceled);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.drawGuides, this);

    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    model.assetsReady(renderer, frames.length, this.units.length, this.effects.length);
    model.audioState(this.audioContextState());
    document.documentElement.dataset.ready = 'true';
  }

  update(time: number, delta: number): void {
    this.animate(this.units, time, 1);
    this.animate(this.effects, time, 1.65);
    model.samplePerformance(delta, this.game.loop.actualFps);
  }

  resetInput(source: string): void {
    this.input.resetPointers();
    model.cancelAll(source);
  }

  async testAudio(): Promise<void> {
    if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) {
      model.audioState('Web Audio unavailable');
      return;
    }
    this.sound.unlock();
    await this.sound.context.resume();

    const oscillator = this.sound.context.createOscillator();
    const gain = this.sound.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, this.sound.context.currentTime);
    gain.gain.setValueAtTime(0.0001, this.sound.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, this.sound.context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.sound.context.currentTime + 0.18);
    oscillator.connect(gain).connect(this.sound.destination);
    oscillator.start();
    oscillator.stop(this.sound.context.currentTime + 0.2);
    model.audioState(this.sound.context.state, true);
  }

  audioContextState(): string {
    return this.sound instanceof Phaser.Sound.WebAudioSoundManager
      ? this.sound.context.state
      : 'Web Audio unavailable';
  }

  private createUnits(frames: string[], count: number, effect: boolean): void {
    const collection = effect ? this.effects : this.units;
    for (let index = 0; index < count; index += 1) {
      const frame = frames[index % frames.length];
      if (!frame) continue;
      const xRatio = ((index * 37) % 100) / 100;
      const yRatio = 0.08 + (((index * 53) % 72) / 100);
      const sprite = this.add.sprite(0, 0, 'units', frame);
      const size = effect ? 0.15 + (index % 4) * 0.03 : 0.25 + (index % 5) * 0.025;
      sprite.setScale(size);
      sprite.setAlpha(effect ? 0.42 : 0.78);
      if (effect) {
        sprite.setBlendMode(Phaser.BlendModes.ADD);
        sprite.setTint(index % 2 === 0 ? 0x78f3cf : 0xc195ff);
        this.tweens.add({
          targets: sprite,
          alpha: { from: 0.18, to: 0.72 },
          scaleX: { from: size * 0.72, to: size * 1.15 },
          scaleY: { from: size * 0.72, to: size * 1.15 },
          yoyo: true,
          repeat: -1,
          duration: 520 + (index % 7) * 95,
        });
      }
      collection.push({
        sprite,
        xRatio,
        yRatio,
        amplitude: effect ? 22 + (index % 6) * 4 : 8 + (index % 5) * 2,
        phase: index * 0.73,
        speed: 0.00032 + (index % 8) * 0.000025,
      });
    }
  }

  private animate(collection: MovingUnit[], time: number, speedMultiplier: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    for (const unit of collection) {
      const wave = Math.sin(time * unit.speed * speedMultiplier + unit.phase);
      unit.sprite.setPosition(
        unit.xRatio * width + wave * unit.amplitude,
        unit.yRatio * height + Math.cos(time * unit.speed + unit.phase) * unit.amplitude * 0.45,
      );
    }
  }

  private drawGuides(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.guides.clear();
    this.guides.fillStyle(0x5de0ae, 0.07).fillRect(0, height * 0.55, width / 2, height * 0.45);
    this.guides.fillStyle(0xc28cff, 0.07).fillRect(width / 2, height * 0.55, width / 2, height * 0.45);
    this.guides.lineStyle(2, 0x7fe8c1, 0.55).strokeRoundedRect(12, height * 0.58, width / 2 - 18, height * 0.36, 18);
    this.guides.lineStyle(2, 0xc9a6ff, 0.55).strokeRoundedRect(width / 2 + 6, height * 0.58, width / 2 - 18, height * 0.36, 18);
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#10251f',
  transparent: false,
  scene: [ProofScene],
  input: {
    activePointers: 3,
    windowEvents: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: 960,
    height: 540,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  audio: {
    disableWebAudio: false,
  },
});

const orientationQuery = window.matchMedia('(orientation: landscape)');
const updateOrientation = (): void => model.orientationChanged(currentOrientation());
orientationQuery.addEventListener('change', updateOrientation);
window.addEventListener('orientationchange', updateOrientation);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    activeScene?.resetInput('page hidden');
  } else {
    model.visibilityRecovered();
    if (activeScene) model.audioState(activeScene.audioContextState());
  }
});

const audioButton = requiredElement<HTMLButtonElement>('audio-button');
const soakButton = requiredElement<HTMLButtonElement>('soak-button');
const copyButton = requiredElement<HTMLButtonElement>('copy-button');

audioButton.addEventListener('click', async () => activeScene?.testAudio());
soakButton.addEventListener('click', () => model.startPerformance());
copyButton.addEventListener('click', async () => {
  const report = JSON.stringify({
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    state: model.snapshot(),
  }, null, 2);
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(report);
    copyButton.textContent = 'Device report copied';
  } else {
    window.prompt('Copy the device report', report);
  }
});

window.__forestRescueProof = {
  snapshot: () => model.snapshot(),
  startPerformance: (durationMs = 60_000) => model.startPerformance(durationMs),
  testAudio: async () => activeScene?.testAudio(),
};

const render = (): void => {
  const state = model.snapshot();
  const completed = [
    state.assetsPass,
    state.twoPointerPass,
    state.cancellationCount > 0,
    state.landscapeRecoveryPass,
    state.audioPass,
    state.performanceResult?.passed === true,
  ].filter(Boolean).length;

  setText('active-pointers', Object.keys(state.activePointers).length);
  setText('max-pointers', state.maxSimultaneousPointers);
  setText('cancellations', state.cancellationCount ? `${state.cancellationCount} · ${state.lastCancelSource}` : 'Not seen');
  setText('orientation', `${state.orientation} · ${state.orientationChanges} changes`);
  setText('orientation-recovery', state.landscapeRecoveryPass ? 'Passed' : 'Not yet');
  setText('visibility-recovery', state.visibilityRecoveries);
  setText('renderer', state.renderer);
  setText('atlas', state.atlasFrames ? `${state.atlasFrames} frames · ${state.spriteCount + state.effectCount} objects` : 'Loading');
  setText('audio', `${state.audioContextState}${state.audioPass ? ' · passed' : ''}`);

  const seconds = Math.round(state.performanceElapsedMs / 1000);
  setText('soak-progress', state.performanceRunning ? `${seconds}s / ${state.performanceDurationMs / 1000}s` : state.performanceResult ? 'Complete' : 'Not run');
  setText('performance-result', state.performanceResult
    ? `${state.performanceResult.passed ? 'Passed' : 'Review'} · ${state.performanceResult.averageFps} fps · ${state.performanceResult.p95FrameMs}ms p95 · ${state.performanceResult.droppedFramePercent}% drops`
    : '—');

  const overall = requiredElement<HTMLOutputElement>('overall');
  overall.textContent = completed === 6 ? '6 / 6 checks passed' : `${completed} / 6 checks passed`;
  overall.dataset.status = completed === 6 ? 'pass' : completed > 0 ? 'warn' : 'waiting';

  const events = requiredElement<HTMLOListElement>('events');
  events.replaceChildren(...state.events.map((message) => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
  requestAnimationFrame(render);
};
requestAnimationFrame(render);

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function setText(id: string, value: string | number): void {
  requiredElement(id).textContent = String(value);
}

void game;
