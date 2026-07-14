export class AudioKit {
  constructor(getMuted = () => false) {
    this.ctx = null;
    this.getMuted = getMuted;
  }

  ensure() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.ctx) this.ctx = new AudioCtor();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  tone(freq, dur, type = "sine", gain = 0.05) {
    if (this.getMuted()) return;
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  plant() { this.tone(440, 0.12, "triangle", 0.055); this.tone(660, 0.16, "sine", 0.035); }
  shoot() { this.tone(760, 0.06, "sine", 0.025); }
  hit() { this.tone(160, 0.08, "sawtooth", 0.035); }
  mana() { this.tone(900, 0.12, "triangle", 0.045); this.tone(1200, 0.14, "sine", 0.03); }
  crush() { this.tone(75, 0.22, "square", 0.06); }
  end(win) { this.tone(win ? 620 : 130, 0.25, "triangle", 0.055); this.tone(win ? 880 : 95, 0.32, "sine", 0.04); }
}
