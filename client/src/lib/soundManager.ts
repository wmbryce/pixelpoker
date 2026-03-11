const SOUNDS = {
  deal:      '/sounds/deal.wav',
  chip:      '/sounds/chip.wav',
  check:     '/sounds/check.wav',
  fold:      '/sounds/fold.wav',
  win:       '/sounds/win.wav',
  notify:    '/sounds/notify.wav',
  timerWarn: '/sounds/timer-warn.wav',
  allin:     '/sounds/allin.wav',
} as const;

export type SoundName = keyof typeof SOUNDS;

const POOL_SIZE = 3;
const LS_VOLUME_KEY = 'pp_volume';
const LS_MUTED_KEY = 'pp_muted';

class SoundManager {
  private pools: Record<string, HTMLAudioElement[]> = {};
  private indices: Record<string, number> = {};
  volume: number;
  isMuted: boolean;

  constructor() {
    this.volume = parseFloat(localStorage.getItem(LS_VOLUME_KEY) ?? '0.5');
    this.isMuted = localStorage.getItem(LS_MUTED_KEY) === 'true';

    for (const [name, src] of Object.entries(SOUNDS)) {
      this.pools[name] = [];
      this.indices[name] = 0;
      for (let i = 0; i < POOL_SIZE; i++) {
        const el = new Audio(src);
        el.preload = 'auto';
        this.pools[name].push(el);
      }
    }
  }

  play(name: SoundName) {
    if (this.isMuted) return;
    const pool = this.pools[name];
    if (!pool) return;
    const idx = this.indices[name] % POOL_SIZE;
    this.indices[name] = idx + 1;
    const el = pool[idx];
    el.volume = this.volume;
    el.currentTime = 0;
    el.play().catch(() => {});
  }

  playDelayed(name: SoundName, delayMs: number) {
    setTimeout(() => this.play(name), delayMs);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem(LS_VOLUME_KEY, String(this.volume));
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem(LS_MUTED_KEY, String(this.isMuted));
  }
}

export const soundManager = new SoundManager();
