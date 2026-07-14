import { describe, expect, it } from 'vitest';
import { DiagnosticsModel } from '../src/domain/diagnostics';

describe('DiagnosticsModel', () => {
  it('recognizes two simultaneous pointers and clears cancelled input', () => {
    const model = new DiagnosticsModel('landscape');

    model.pointerDown(1, 'left');
    model.pointerDown(2, 'right');
    model.cancelAll('test cancellation');

    const state = model.snapshot();
    expect(state.twoPointerPass).toBe(true);
    expect(state.maxSimultaneousPointers).toBe(2);
    expect(state.activePointers).toEqual({});
    expect(state.cancellationCount).toBe(1);
  });

  it('requires portrait then landscape for orientation recovery', () => {
    const model = new DiagnosticsModel('landscape');

    model.orientationChanged('portrait');
    model.orientationChanged('landscape');

    expect(model.snapshot()).toMatchObject({
      orientationChanges: 2,
      landscapeRecoveryPass: true,
    });
  });

  it('passes sustained performance inside the documented budget', () => {
    const model = new DiagnosticsModel('landscape');
    model.startPerformance(1_000, 0);
    for (let now = 10; now <= 1_000; now += 10) {
      model.samplePerformance(16.7, 59.8, now);
    }

    expect(model.snapshot().performanceResult).toEqual({
      averageFps: 59.8,
      p95FrameMs: 16.7,
      droppedFramePercent: 0,
      passed: true,
    });
  });
});
