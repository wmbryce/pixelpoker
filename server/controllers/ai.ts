import type { Poker, GameAction } from './types';

export const makeAIDecision = (game: Poker, playerIndex: number): GameAction => {
  const player = game.players[playerIndex];
  const amountToCall = game.currentBet - player.lastBet;
  const rand = Math.random();

  if (amountToCall === 0) {
    // Nothing to call — check or occasionally raise
    if (rand < 0.25 && player.stack >= game.bigBlind * 2) {
      const bet = Math.min(
        game.bigBlind * (1 + Math.floor(Math.random() * 3)),
        player.stack,
      );
      return { type: 'raise', playerIndex, bet };
    }
    return { type: 'call', playerIndex }; // check
  }

  if (rand < 0.20) return { type: 'fold', playerIndex };
  if (rand < 0.85) return { type: 'call', playerIndex };

  // Raise
  const raiseBet = Math.min(game.currentBet * 2, player.stack);
  if (raiseBet <= amountToCall) return { type: 'call', playerIndex };
  return { type: 'raise', playerIndex, bet: raiseBet };
};
