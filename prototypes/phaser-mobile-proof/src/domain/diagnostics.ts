export type DeviceOrientation = 'landscape' | 'portrait';
export type TouchPad = 'left' | 'right';

export interface PerformanceResult {
  averageFps: number;
  p95FrameMs: number;
  droppedFramePercent: number;
  passed: boolean;
}

export interface DiagnosticState {
  activePointers: Readonly<Record<string, TouchPad>>;
  maxSimultaneousPointers: number;
  twoPointerPass: boolean;
  cancellationCount: number;
  lastCancelSource: string | null;
  orientation: DeviceOrientation;
  orientationChanges: number;
  landscapeRecoveryPass: boolean;
  visibilityRecoveries: number;
  renderer: string;
  atlasFrames: number;
  spriteCount: number;
  effectCount: number;
  assetsPass: boolean;
  audioContextState: string;
  audioResumeCount: number;
  audioPass: boolean;
  performanceRunning: boolean;
  performanceElapsedMs: number;
  performanceDurationMs: number;
  performanceResult: PerformanceResult | null;
  events: readonly string[];
}

const emptyState = (orientation: DeviceOrientation): DiagnosticState => ({
  activePointers: {},
  maxSimultaneousPointers: 0,
  twoPointerPass: false,
  cancellationCount: 0,
  lastCancelSource: null,
  orientation,
  orientationChanges: 0,
  landscapeRecoveryPass: false,
  visibilityRecoveries: 0,
  renderer: 'waiting',
  atlasFrames: 0,
  spriteCount: 0,
  effectCount: 0,
  assetsPass: false,
  audioContextState: 'waiting',
  audioResumeCount: 0,
  audioPass: false,
  performanceRunning: false,
  performanceElapsedMs: 0,
  performanceDurationMs: 60_000,
  performanceResult: null,
  events: [],
});

export class DiagnosticsModel {
  private state: DiagnosticState;
  private activePointers = new Map<number, TouchPad>();
  private frameTimes: number[] = [];
  private fpsSamples: number[] = [];
  private soakStartedAt = 0;

  constructor(initialOrientation: DeviceOrientation) {
    this.state = emptyState(initialOrientation);
    this.record(`Started in ${initialOrientation}`);
  }

  pointerDown(pointerId: number, pad: TouchPad): void {
    this.activePointers.set(pointerId, pad);
    const count = this.activePointers.size;
    this.state = {
      ...this.state,
      maxSimultaneousPointers: Math.max(this.state.maxSimultaneousPointers, count),
      twoPointerPass: this.state.twoPointerPass || count >= 2,
    };
    this.syncPointers();
    this.record(`Pointer ${pointerId} down on ${pad}`);
  }

  pointerUp(pointerId: number, wasCanceled = false): void {
    this.activePointers.delete(pointerId);
    this.syncPointers();
    if (wasCanceled) {
      this.recordCancellation('Phaser touchcancel');
      return;
    }
    this.record(`Pointer ${pointerId} up`);
  }

  cancelAll(source: string): void {
    this.activePointers.clear();
    this.syncPointers();
    this.recordCancellation(source);
  }

  orientationChanged(next: DeviceOrientation): void {
    if (next === this.state.orientation) return;
    const recovered = this.state.orientation === 'portrait' && next === 'landscape';
    this.state = {
      ...this.state,
      orientation: next,
      orientationChanges: this.state.orientationChanges + 1,
      landscapeRecoveryPass: this.state.landscapeRecoveryPass || recovered,
    };
    this.record(`Orientation changed to ${next}`);
  }

  visibilityRecovered(): void {
    this.state = {
      ...this.state,
      visibilityRecoveries: this.state.visibilityRecoveries + 1,
    };
    this.record('Page returned from background');
  }

  assetsReady(renderer: string, atlasFrames: number, spriteCount: number, effectCount: number): void {
    this.state = {
      ...this.state,
      renderer,
      atlasFrames,
      spriteCount,
      effectCount,
      assetsPass: renderer === 'WebGL' && atlasFrames > 0 && spriteCount > 0 && effectCount > 0,
    };
    this.record(`${renderer}: ${atlasFrames} atlas frames, ${spriteCount} sprites, ${effectCount} effects`);
  }

  audioState(contextState: string, didBeep = false): void {
    this.state = {
      ...this.state,
      audioContextState: contextState,
      audioResumeCount: this.state.audioResumeCount + (didBeep ? 1 : 0),
      audioPass: this.state.audioPass || (didBeep && contextState === 'running'),
    };
    this.record(didBeep ? `Audio resumed and beeped (${contextState})` : `Audio context: ${contextState}`);
  }

  startPerformance(durationMs = 60_000, now = performance.now()): void {
    this.frameTimes = [];
    this.fpsSamples = [];
    this.soakStartedAt = now;
    this.state = {
      ...this.state,
      performanceRunning: true,
      performanceElapsedMs: 0,
      performanceDurationMs: durationMs,
      performanceResult: null,
    };
    this.record(`Started ${Math.round(durationMs / 1000)}s performance run`);
  }

  samplePerformance(frameMs: number, fps: number, now = performance.now()): void {
    if (!this.state.performanceRunning) return;
    this.frameTimes.push(frameMs);
    this.fpsSamples.push(fps);
    const elapsed = Math.min(now - this.soakStartedAt, this.state.performanceDurationMs);
    this.state = { ...this.state, performanceElapsedMs: elapsed };
    if (elapsed >= this.state.performanceDurationMs) this.finishPerformance();
  }

  snapshot(): DiagnosticState {
    return {
      ...this.state,
      activePointers: Object.fromEntries(this.activePointers.entries()),
      events: [...this.state.events],
      performanceResult: this.state.performanceResult ? { ...this.state.performanceResult } : null,
    };
  }

  private finishPerformance(): void {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    const p95FrameMs = sorted[p95Index] ?? Number.POSITIVE_INFINITY;
    const averageFps = this.fpsSamples.length
      ? this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length
      : 0;
    const droppedFrames = this.frameTimes.filter((frameMs) => frameMs > 25).length;
    const droppedFramePercent = this.frameTimes.length ? (droppedFrames / this.frameTimes.length) * 100 : 100;
    const result = {
      averageFps: round(averageFps),
      p95FrameMs: round(p95FrameMs),
      droppedFramePercent: round(droppedFramePercent),
      passed: averageFps >= 50 && p95FrameMs <= 25 && droppedFramePercent <= 5,
    };
    this.state = {
      ...this.state,
      performanceRunning: false,
      performanceElapsedMs: this.state.performanceDurationMs,
      performanceResult: result,
    };
    this.record(`Performance ${result.passed ? 'passed' : 'needs review'}: ${result.averageFps} fps avg, ${result.p95FrameMs}ms p95`);
  }

  private syncPointers(): void {
    this.state = { ...this.state, activePointers: Object.fromEntries(this.activePointers.entries()) };
  }

  private recordCancellation(source: string): void {
    this.state = {
      ...this.state,
      cancellationCount: this.state.cancellationCount + 1,
      lastCancelSource: source,
    };
    this.record(`Pointer cancellation recovered: ${source}`);
  }

  private record(message: string): void {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    this.state = {
      ...this.state,
      events: [`${timestamp} — ${message}`, ...this.state.events].slice(0, 10),
    };
  }
}

const round = (value: number): number => Math.round(value * 10) / 10;
