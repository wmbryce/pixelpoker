import { Poker } from "./types";
import { cloneDeep } from "lodash";

export const raise = (game: Poker, playerIndex: number, bet: number) => {
  const newGame = cloneDeep(game);
  newGame.players[playerIndex].stack -= bet;
  newGame.pot += bet;
  return { result: newGame, error: null };
};

export const call = (game: Poker, playerIndex: number, bet: number) => {
  game.players[playerIndex].stack -= bet;
  game.pot += bet;
};

export const fold = (game: Poker, playerIndex: number) => {
  const newGame = cloneDeep(game);
  newGame.players[playerIndex].isActive = false;
  return { result: newGame, error: null };
};

export const nextPlayer = (game: Poker, currentIndex: number) => {
  const numberOfPlayers = game.players.length;
  return currentIndex + 1 < numberOfPlayers ? currentIndex + 1 : 0;
};
