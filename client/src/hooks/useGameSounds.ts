import { useEffect, useRef } from 'react';
import { soundManager } from '../lib/soundManager';
import type { Poker } from '@pixelpoker/shared';

export function useGameSounds(game: Poker | null, myPlayerIndex: number | null) {
  const prevRef = useRef<Poker | null>(null);
  const timerWarnedRef = useRef(false);

  useEffect(() => {
    if (!game) return;
    const prev = prevRef.current;
    prevRef.current = game;

    // Don't fire sounds on initial load / rejoin
    if (!prev) return;

    // Stage transitions → deal sounds
    if (prev.stage !== game.stage) {
      if (game.stage === 1) {
        // Hole cards dealt
        soundManager.play('deal');
        soundManager.playDelayed('deal', 120);
      } else if (game.stage === 2) {
        // Flop — 3 staggered deals
        soundManager.play('deal');
        soundManager.playDelayed('deal', 200);
        soundManager.playDelayed('deal', 400);
      } else if (game.stage === 3 || game.stage === 4) {
        // Turn / River
        soundManager.play('deal');
      }
    }

    // Player action detection
    for (let i = 0; i < game.players.length; i++) {
      const pp = prev.players[i];
      const cp = game.players[i];
      if (!pp || !cp) continue;
      if (cp.lastAction === pp.lastAction) continue;

      if (cp.lastAction === 'FOLD') {
        soundManager.play('fold');
      } else if (cp.lastAction === 'CHECK') {
        soundManager.play('check');
      } else if (cp.lastAction === 'CALL') {
        soundManager.play('chip');
      } else if (cp.lastAction?.startsWith('RAISE')) {
        soundManager.play('chip');
      }

      // All-in detection
      if (!pp.isAllIn && cp.isAllIn) {
        soundManager.play('allin');
      }
    }

    // Winner declared
    if (prev.winner.length === 0 && game.winner.length > 0) {
      soundManager.play('win');
    }

    // My turn notification
    if (myPlayerIndex !== null && game.actionOn === myPlayerIndex && prev.actionOn !== myPlayerIndex) {
      soundManager.play('notify');
      timerWarnedRef.current = false;
    }
  }, [game, myPlayerIndex]);

  // Timer warning — separate effect for tick-based checks
  useEffect(() => {
    if (!game || game.timerDeadline === null || myPlayerIndex === null) return;
    if (game.actionOn !== myPlayerIndex) return;

    const tick = () => {
      const left = Math.ceil((game.timerDeadline! - Date.now()) / 1000);
      if (left <= 5 && left > 0 && !timerWarnedRef.current) {
        soundManager.play('timerWarn');
        timerWarnedRef.current = true;
      }
    };

    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [game?.timerDeadline, game?.actionOn, myPlayerIndex]);
}
