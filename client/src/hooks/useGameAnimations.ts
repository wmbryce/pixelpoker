import { useEffect, useRef, useState } from 'react';
import type { Poker } from '@pixelpoker/shared';

export interface AnimationState {
  /** Number of community cards that are "new" and should animate */
  newCommunityCards: number;
  /** Stagger delay between community card animations in ms */
  communityStaggerMs: number;
  /** Player indices currently playing fold-toss animation */
  foldingPlayers: Set<number>;
  /** Player indices whose cards are being revealed (showdown flip) */
  revealingPlayers: Set<number>;
}

const INITIAL: AnimationState = {
  newCommunityCards: 0,
  communityStaggerMs: 0,
  foldingPlayers: new Set(),
  revealingPlayers: new Set(),
};

export function useGameAnimations(game: Poker | null): AnimationState {
  const prevRef = useRef<Poker | null>(null);
  const [state, setState] = useState<AnimationState>(INITIAL);
  const timeoutIds = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const safeTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutIds.current.delete(id);
      fn();
    }, ms);
    timeoutIds.current.add(id);
  };

  useEffect(() => {
    return () => {
      for (const id of timeoutIds.current) clearTimeout(id);
      timeoutIds.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!game) return;
    const prev = prevRef.current;
    prevRef.current = game;

    // Don't animate on initial load / rejoin
    if (!prev) return;

    const updates: Partial<AnimationState> = {};

    // Community card reveals
    const prevCount = prev.tableCards.length;
    const newCount = game.tableCards.length;
    if (newCount > prevCount) {
      const added = newCount - prevCount;
      updates.newCommunityCards = added;
      updates.communityStaggerMs = added === 3 ? 200 : 0; // stagger only on flop

      // Clear after animations finish
      const totalDuration = added === 3 ? 600 + 400 : 600; // stagger + animation
      safeTimeout(() => {
        setState((s) => ({ ...s, newCommunityCards: 0, communityStaggerMs: 0 }));
      }, totalDuration);
    }

    // Fold detection
    const folding = new Set<number>();
    for (let i = 0; i < game.players.length; i++) {
      const pp = prev.players[i];
      const cp = game.players[i];
      if (!pp || !cp) continue;
      if (pp.isActive && !cp.isActive && cp.lastAction === 'FOLD') {
        folding.add(i);
      }
    }
    if (folding.size > 0) {
      updates.foldingPlayers = folding;
      safeTimeout(() => {
        setState((s) => ({ ...s, foldingPlayers: new Set() }));
      }, 350);
    }

    // Showdown card reveal detection
    const revealing = new Set<number>();
    for (let i = 0; i < game.players.length; i++) {
      const pp = prev.players[i];
      const cp = game.players[i];
      if (!pp || !cp) continue;
      // Cards went from hidden (length 0) to visible
      if (pp.cards.length === 0 && cp.cards.length > 0) {
        revealing.add(i);
      }
    }
    if (revealing.size > 0) {
      updates.revealingPlayers = revealing;
      safeTimeout(() => {
        setState((s) => ({ ...s, revealingPlayers: new Set() }));
      }, 600);
    }

    if (Object.keys(updates).length > 0) {
      setState((s) => ({ ...s, ...updates }));
    }
  }, [game]);

  return state;
}
