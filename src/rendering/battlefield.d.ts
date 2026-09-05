import type { CompiledLevel } from '../../app/domain/types';
import type { catalog } from '../../app/art';

export function createBattlefieldRenderer(
  level: CompiledLevel,
  assets: typeof catalog,
  options: { images: Record<string, { img: CanvasImageSource; ready: boolean }> },
): { render(ctx: CanvasRenderingContext2D, width: number, height: number): unknown };
