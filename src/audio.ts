type AudioEngineState = {
  context: AudioContext;
  master: GainNode;
  noiseBuffer: AudioBuffer;
};

class GameAudio {
  private state: AudioEngineState | null = null;
  private readonly unlockHandler = () => {
    void this.unlock();
  };

  init(): void {
    this.installUnlockListeners();
  }

  playWalk(): void {
    const state = this.ensureState();
    if (!state) return;

    const now = state.context.currentTime;
    const oscA = state.context.createOscillator();
    const oscB = state.context.createOscillator();
    const gain = state.context.createGain();
    const filter = state.context.createBiquadFilter();

    oscA.type = 'square';
    oscB.type = 'triangle';
    oscA.frequency.setValueAtTime(220, now);
    oscA.frequency.exponentialRampToValueAtTime(155, now + 0.07);
    oscB.frequency.setValueAtTime(330, now);
    oscB.frequency.exponentialRampToValueAtTime(230, now + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(state.master);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + 0.11);
    oscB.stop(now + 0.11);
  }

  playPush(): void {
    const state = this.ensureState();
    if (!state) return;

    const now = state.context.currentTime;
    const source = state.context.createBufferSource();
    const filter = state.context.createBiquadFilter();
    const gain = state.context.createGain();
    const thump = state.context.createOscillator();
    const thumpGain = state.context.createGain();

    source.buffer = state.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(170, now + 0.16);
    filter.Q.value = 1.2;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    thump.type = 'triangle';
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(68, now + 0.18);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.master);
    thump.connect(thumpGain);
    thumpGain.connect(state.master);

    source.start(now);
    source.stop(now + 0.22);
    thump.start(now);
    thump.stop(now + 0.18);
  }

  playExplosion(): void {
    const state = this.ensureState();
    if (!state) return;

    const now = state.context.currentTime;
    const noise = state.context.createBufferSource();
    const noiseFilter = state.context.createBiquadFilter();
    const noiseGain = state.context.createGain();
    const boom = state.context.createOscillator();
    const boomGain = state.context.createGain();

    noise.buffer = state.noiseBuffer;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(900, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(160, now + 0.45);

    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    boom.type = 'triangle';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(38, now + 0.42);

    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(state.master);

    boom.connect(boomGain);
    boomGain.connect(state.master);

    noise.start(now);
    noise.stop(now + 0.52);
    boom.start(now);
    boom.stop(now + 0.38);
  }

  playCoin(): void {
    const state = this.ensureState();
    if (!state) return;

    const now = state.context.currentTime;
    const oscA = state.context.createOscillator();
    const oscB = state.context.createOscillator();
    const oscC = state.context.createOscillator();
    const gain = state.context.createGain();

    oscA.type = 'square';
    oscB.type = 'square';
    oscC.type = 'triangle';
    oscA.frequency.setValueAtTime(988, now);
    oscB.frequency.setValueAtTime(1480, now + 0.05);
    oscC.frequency.setValueAtTime(1976, now + 0.1);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    oscA.connect(gain);
    oscB.connect(gain);
    oscC.connect(gain);
    gain.connect(state.master);

    oscA.start(now);
    oscA.stop(now + 0.09);
    oscB.start(now + 0.05);
    oscB.stop(now + 0.16);
    oscC.start(now + 0.1);
    oscC.stop(now + 0.26);
  }

  playVictory(): void {
    const state = this.ensureState();
    if (!state) return;

    const now = state.context.currentTime;
    const notes = [
      { freq: 523.25, start: 0.0, duration: 0.12 },
      { freq: 659.25, start: 0.11, duration: 0.12 },
      { freq: 783.99, start: 0.22, duration: 0.14 },
      { freq: 1046.5, start: 0.36, duration: 0.24 },
    ];

    for (const note of notes) {
      const osc = state.context.createOscillator();
      const gain = state.context.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.055, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      osc.connect(gain);
      gain.connect(state.master);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  }

  private installUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.unlockHandler, { passive: true });
    window.addEventListener('keydown', this.unlockHandler);
    window.addEventListener('touchstart', this.unlockHandler, { passive: true });
  }

  private ensureState(): AudioEngineState | null {
    if (typeof window === 'undefined') return null;
    if (this.state) {
      void this.state.context.resume();
      return this.state;
    }

    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;

    const context = new AudioCtor();
    const master = context.createGain();
    master.gain.value = 0.34;
    master.connect(context.destination);

    this.state = {
      context,
      master,
      noiseBuffer: this.createNoiseBuffer(context),
    };
    void context.resume();
    return this.state;
  }

  private async unlock(): Promise<void> {
    const state = this.ensureState();
    if (!state) return;

    try {
      if (state.context.state !== 'running') {
        await state.context.resume();
      }

      // Warm up the graph with a near-silent click so mobile Safari and some
      // embedded browsers fully unlock subsequent Web Audio playback.
      const now = state.context.currentTime;
      const osc = state.context.createOscillator();
      const gain = state.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.00001, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.03);
      osc.connect(gain);
      gain.connect(state.master);
      osc.start(now);
      osc.stop(now + 0.04);

      this.removeUnlockListeners();
    } catch {
      // Keep listeners installed so the next user interaction can retry.
    }
  }

  private removeUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.unlockHandler);
    window.removeEventListener('keydown', this.unlockHandler);
    window.removeEventListener('touchstart', this.unlockHandler);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 0.6);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export const gameAudio = new GameAudio();
