import { create } from 'zustand';
import type { Poker } from '@pixelpoker/shared';

interface GameStore {
  game: Poker | null;
  username: string | null;
  room: string | null;
  myPlayerIndex: number | null;
  setGame: (game: Poker) => void;
  setUsername: (username: string) => void;
  setRoom: (room: string) => void;
  setMyPlayerIndex: (index: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  game: null,
  username: null,
  room: null,
  myPlayerIndex: null,
  setGame: (game) => set({ game }),
  setUsername: (username) => set({ username }),
  setRoom: (room) => set({ room }),
  setMyPlayerIndex: (myPlayerIndex) => set({ myPlayerIndex }),
}));
