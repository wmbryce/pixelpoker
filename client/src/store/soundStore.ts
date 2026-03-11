import { create } from 'zustand';
import { soundManager } from '../lib/soundManager';

interface SoundStore {
  volume: number;
  isMuted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

export const useSoundStore = create<SoundStore>((set) => ({
  volume: soundManager.volume,
  isMuted: soundManager.isMuted,
  setVolume: (v) => {
    soundManager.setVolume(v);
    set({ volume: soundManager.volume });
  },
  toggleMute: () => {
    soundManager.toggleMute();
    set({ isMuted: soundManager.isMuted });
  },
}));
