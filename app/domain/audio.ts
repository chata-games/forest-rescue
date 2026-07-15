// Engine-independent audio controls (issue #33).
//
// Music, effects, and a master bus are controlled independently, and no required
// information is audio-only: every audio cue has an existing visual/textual
// representation (see AUDIO_CUES), and audio is declared supplementary
// (AUDIO_IS_SUPPLEMENTARY). Audio settings never gate gameplay — they only scale
// volume — so a player who cannot hear loses nothing.
//
// Nothing here touches localStorage or the DOM: that is the shell's job (a
// dedicated localStorage key, range controls, and mute toggles). This module is
// the pure boundary the shell and its vitest suite drive, mirroring the save
// contract (without the migration ladder — preferences have no content epoch).

/** The three independent audio channels: a master bus plus music and effects. */
export type AudioChannel = 'master' | 'music' | 'effects';

/** The channel list in control-surface order. */
export const AUDIO_CHANNELS: readonly AudioChannel[] = ['master', 'music', 'effects'];

/** Default per-channel levels (0..1): audible on every channel, master at full. */
const DEFAULT_LEVELS: Record<AudioChannel, number> = {
  master: 1,
  music: 0.8,
  effects: 0.8,
};

/** Per-channel volume levels. Each is an independent 0..1 slider. */
export interface AudioSettings {
  master: number;
  music: number;
  effects: number;
}

/** Fresh, audible defaults for every channel. */
export function defaultAudioSettings(): AudioSettings {
  return { ...DEFAULT_LEVELS };
}

/** Clamp a volume value into [0, 1]. */
export function clampVolume(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Set one channel's level, clamped. Pure: returns a new settings object. */
export function setChannel(settings: AudioSettings, channel: AudioChannel, value: number): AudioSettings {
  return { ...settings, [channel]: clampVolume(value) };
}

/**
 * The effective volume a channel plays at. The master bus gates music and
 * effects (effective = master × channel); master is itself. A muted master
 * therefore silences the whole mix while leaving the per-channel levels intact
 * (independent settings survive a master mute, AC4).
 */
export function effectiveVolume(settings: AudioSettings, channel: AudioChannel): number {
  if (channel === 'master') return settings.master;
  return settings.master * settings[channel];
}

/** Whether the whole mix is silent (the master bus is at zero). */
export function isMuted(settings: AudioSettings): boolean {
  return settings.master === 0;
}

/** Whether a channel is effectively silent (after the master bus gates it). */
export function isChannelMuted(settings: AudioSettings, channel: AudioChannel): boolean {
  return effectiveVolume(settings, channel) === 0;
}

/**
 * Toggle a channel between silenced and its default level. Operates on the
 * channel's own level (not the master-gated effective volume) so the three
 * channels stay independently controllable. Pure.
 */
export function toggleChannelMute(settings: AudioSettings, channel: AudioChannel): AudioSettings {
  return settings[channel] === 0 ? setChannel(settings, channel, DEFAULT_LEVELS[channel]) : setChannel(settings, channel, 0);
}

/** Structural equality for two settings objects. */
export function equalSettings(a: AudioSettings, b: AudioSettings): boolean {
  return a.master === b.master && a.music === b.music && a.effects === b.effects;
}

/** Serialize settings to a JSON string for localStorage. */
export function serializeAudio(settings: AudioSettings): string {
  return JSON.stringify(settings);
}

/**
 * Load + sanitize settings from a raw localStorage string. Never throws: any
 * missing, non-numeric, or out-of-range value yields the audible defaults, so a
 * corrupt or partial preference can never silence the game or trap the player.
 */
export function loadAudio(raw: string | null | undefined): AudioSettings {
  if (raw == null || raw === '') return defaultAudioSettings();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultAudioSettings();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaultAudioSettings();
  const obj = parsed as Record<string, unknown>;
  // Require all three channels present and numeric; a partial record is treated
  // as corrupt (defaults) so a half-written value can never quietly apply.
  if (typeof obj.master !== 'number' || typeof obj.music !== 'number' || typeof obj.effects !== 'number') {
    return defaultAudioSettings();
  }
  return {
    master: clampVolume(obj.master),
    music: clampVolume(obj.music),
    effects: clampVolume(obj.effects),
  };
}

// --- No required information is audio-only (AC4) ---------------------------

/**
 * Audio is supplementary, never required: every cue below already has a visual
 * or textual representation in the shell, and audio settings gate only volume
 * (never gameplay). This flag makes the invariant explicit and checkable.
 */
export const AUDIO_IS_SUPPLEMENTARY = true;

/** One audio cue and the existing, always-present non-audio signal for it. */
export interface AudioCue {
  id: string;
  /** The existing visual/textual representation — never empty (no audio-only info). */
  visualFallback: string;
}

/**
 * The catalogue of audio cues, each paired with its non-audio representation
 * (issue #33 AC4). Asserted in tests to guarantee no cue is audio-only: if a
 * cue is ever added without a fallback, the suite fails.
 */
export const AUDIO_CUES: readonly AudioCue[] = [
  { id: 'place', visualFallback: 'The "Planted …" hint and the Defender sprite now occupying the ring.' },
  { id: 'cast', visualFallback: 'The "Cast …" hint and the spell effect animating on the battlefield.' },
  { id: 'collect', visualFallback: 'The "+N mana" hint and the Mana counter rising in the HUD.' },
  { id: 'victory', visualFallback: 'The Victory outcome overlay with stars and a Return to Trail action.' },
  { id: 'defeat', visualFallback: 'The Defeat outcome overlay with a retry action.' },
  { id: 'unlock', visualFallback: 'The "Unlocks: …" rewards line on the level detail and Trail node.' },
  { id: 'upgrade', visualFallback: 'The "Upgraded to tier N" hint and the Defender’s tier label in the context panel.' },
];
