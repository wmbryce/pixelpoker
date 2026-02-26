import { create } from 'zustand';
import type { Poker } from '@pixelpoker/shared';

interface GameStore {
  game: Poker | null;
  username: string | null;
  room: string | null;
  myPlayerIndex: number | null;
  clientId: string | null;
  setGame: (game: Poker) => void;
  setUsername: (username: string | null) => void;
  setRoom: (room: string | null) => void;
  setMyPlayerIndex: (index: number) => void;
  setClientId: (id: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  game: null,
  username: null,
  room: null,
  myPlayerIndex: null,
  clientId: null,
  setGame: (game) => set({ game }),
  setUsername: (username) => set({ username }),
  setRoom: (room) => set({ room }),
  setMyPlayerIndex: (myPlayerIndex) => set({ myPlayerIndex }),
  setClientId: (clientId) => set({ clientId }),
}));
