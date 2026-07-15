import { describe, it, expect } from 'vitest';
import {
  AUDIO_CHANNELS,
  AUDIO_IS_SUPPLEMENTARY,
  AUDIO_CUES,
  defaultAudioSettings,
  setChannel,
  effectiveVolume,
  isMuted,
  isChannelMuted,
  toggleChannelMute,
  equalSettings,
  serializeAudio,
  loadAudio,
  type AudioSettings,
  type AudioChannel,
} from './audio';

// Engine-independent audio-control rules (issue #33). Music, effects, and a
// master bus are controlled independently; nothing required is audio-only. These
// pure rules are driven by the shell (localStorage IO + range controls) and this
// vitest suite, mirroring the save contract.

describe('audio channels (issue #33 AC4)', () => {
  it('exposes exactly the three independent channels: master, music, effects', () => {
    expect(AUDIO_CHANNELS).toEqual(['master', 'music', 'effects']);
  });

  it('default settings are audible on every channel', () => {
    const s = defaultAudioSettings();
    for (const ch of AUDIO_CHANNELS) expect(effectiveVolume(s, ch)).toBeGreaterThan(0);
    expect(isMuted(s)).toBe(false);
  });
});

describe('independent control (issue #33 AC4)', () => {
  it('muting music does not mute effects, and vice versa', () => {
    let s: AudioSettings = defaultAudioSettings();
    s = setChannel(s, 'music', 0);
    expect(isChannelMuted(s, 'music')).toBe(true);
    expect(isChannelMuted(s, 'effects')).toBe(false);
    expect(effectiveVolume(s, 'effects')).toBeGreaterThan(0);

    s = setChannel(s, 'music', 0.8);
    s = setChannel(s, 'effects', 0);
    expect(isChannelMuted(s, 'effects')).toBe(true);
    expect(isChannelMuted(s, 'music')).toBe(false);
  });

  it('the master bus gates every channel; muting master mutes all', () => {
    let s: AudioSettings = defaultAudioSettings();
    s = setChannel(s, 'master', 0);
    expect(isMuted(s)).toBe(true);
    for (const ch of ['music', 'effects'] as const) {
      expect(effectiveVolume(s, ch)).toBe(0);
    }
    // But the per-channel level is preserved (independent settings survive a master mute).
    expect(s.music).toBe(defaultAudioSettings().music);
    expect(s.effects).toBe(defaultAudioSettings().effects);
  });

  it('effective music volume is master × music; effects is master × effects', () => {
    const s = setChannel(setChannel(defaultAudioSettings(), 'master', 0.5), 'music', 0.8);
    expect(effectiveVolume(s, 'music')).toBeCloseTo(0.4, 5);
  });

  it('setChannel clamps out-of-range values into [0, 1]', () => {
    const s = setChannel(defaultAudioSettings(), 'music', 5);
    expect(s.music).toBe(1);
    const s2 = setChannel(defaultAudioSettings(), 'music', -3);
    expect(s2.music).toBe(0);
  });

  it('setChannel is pure (input untouched) and only touches the named channel', () => {
    const before = defaultAudioSettings();
    const after = setChannel(before, 'effects', 0.25);
    expect(before.effects).toBe(defaultAudioSettings().effects);
    expect(after.effects).toBeCloseTo(0.25, 5);
    expect(after.music).toBe(before.music);
    expect(after.master).toBe(before.master);
  });
});

describe('mute toggles (issue #33 AC4)', () => {
  it('toggleChannelMute silences a channel, then restores it', () => {
    let s = defaultAudioSettings();
    s = toggleChannelMute(s, 'music');
    expect(isChannelMuted(s, 'music')).toBe(true);
    s = toggleChannelMute(s, 'music');
    expect(isChannelMuted(s, 'music')).toBe(false);
  });

  it('toggling master mute silences and restores the whole mix', () => {
    let s = defaultAudioSettings();
    s = toggleChannelMute(s, 'master');
    expect(isMuted(s)).toBe(true);
    s = toggleChannelMute(s, 'master');
    expect(isMuted(s)).toBe(false);
  });
});

describe('persistence shape (issue #33)', () => {
  it('round-trips settings through serialize → load', () => {
    const s = setChannel(setChannel(defaultAudioSettings(), 'music', 0.3), 'effects', 0.6);
    const restored = loadAudio(serializeAudio(s));
    expect(equalSettings(restored, s)).toBe(true);
  });

  it('equalSettings distinguishes differing settings', () => {
    const a = defaultAudioSettings();
    const b = setChannel(a, 'music', 0.2);
    expect(equalSettings(a, b)).toBe(false);
  });

  it('loadAudio recovers safely from missing / corrupt / partial data', () => {
    expect(equalSettings(loadAudio(null), defaultAudioSettings())).toBe(true);
    expect(equalSettings(loadAudio(''), defaultAudioSettings())).toBe(true);
    expect(equalSettings(loadAudio('{ not json'), defaultAudioSettings())).toBe(true);
    expect(equalSettings(loadAudio(JSON.stringify({ music: 0.4 })), defaultAudioSettings())).toBe(true);
  });

  it('loadAudio clamps loaded values into range', () => {
    const restored = loadAudio(JSON.stringify({ master: 9, music: -1, effects: 0.5 }));
    expect(restored.master).toBe(1);
    expect(restored.music).toBe(0);
    expect(restored.effects).toBeCloseTo(0.5, 5);
  });
});

describe('no required information is audio-only (issue #33 AC4)', () => {
  it('declares audio as supplementary, not required', () => {
    expect(AUDIO_IS_SUPPLEMENTARY).toBe(true);
  });

  it('every audio cue has a non-audio (visual / textual) representation', () => {
    expect(AUDIO_CUES.length).toBeGreaterThan(0);
    for (const cue of AUDIO_CUES) {
      expect(cue.id.length).toBeGreaterThan(0);
      // The fallback is the existing, always-present non-audio signal — never empty.
      expect(cue.visualFallback.length).toBeGreaterThan(0);
    }
  });

  it('covers the core battle events (place, cast, collect, victory, defeat)', () => {
    const ids = AUDIO_CUES.map((c) => c.id);
    for (const required of ['place', 'cast', 'collect', 'victory', 'defeat']) {
      expect(ids).toContain(required);
    }
  });
});

// Type-level sanity: a channel is exactly master | music | effects.
describe('AudioChannel', () => {
  it('matches the channel list', () => {
    const ch: AudioChannel = 'music';
    expect(AUDIO_CHANNELS.includes(ch)).toBe(true);
  });
});
