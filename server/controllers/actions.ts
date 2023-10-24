import { Poker } from "./types";
import { cloneDeep, isEqual } from "lodash";

export const raise = (game: Poker, playerIndex: number, bet: number) => {
  const newGame = cloneDeep(game);
  if (bet <= newGame.players[playerIndex].stack) {
    newGame.players[playerIndex].stack -= bet;
    newGame.players[playerIndex].lastBet = bet;
    newGame.currentBet = bet;
    newGame.pot += bet;
    return { result: newGame, error: null };
  } else {
    return { result: null, error: "Invalid bet" };
  }
};

export const call = (game: Poker, playerIndex: number) => {
  const newGame = cloneDeep(game);
  const bet = game.currentBet - game.players[playerIndex].lastBet;
  console.log(
    "calling bet: ",
    game.currentBet,
    bet,
    bet <= newGame.players[playerIndex].stack
  );
  if (bet <= newGame.players[playerIndex].stack) {
    newGame.players[playerIndex].stack -= bet;
    newGame.pot += bet;
    newGame.players[playerIndex].lastBet = game.currentBet;
    newGame.players[playerIndex].checked = bet === 0;
    return { result: newGame, error: null };
  } else {
    return { result: null, error: "Invalid check" };
  }
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
