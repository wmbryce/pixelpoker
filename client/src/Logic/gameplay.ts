import { generateDeck } from "./deck";
import { CardType, Poker, PlayerType } from "./types";
import { cloneDeep, isEqual } from "lodash";
import Card from "../Components/Card";
const Hand = require("pokersolver").Hand;

export const initalizeGame = () => {
  const playersInit = [
    createPlayer("Michael", 1000),
    createPlayer("Bethany", 1000),
    createPlayer("Computer", 1000),
  ];

  const gameInit: Poker = {
    stage: 0,
    pot: 0,
    tableCards: [],
    deck: generateDeck(),
    players: playersInit,
    winner: [],
    actionOn: 1,
    currentBet: 0,
    dealer: 0,
  };
  return gameInit;
};

export const createPlayer = (name: string, stack: number) => {
  return { name, stack, cards: [], lastBet: 0, isActive: true, checked: false };
};

export const dealPreFlop = (game: Poker) => {
  const cardsToDeal = game.players.length * 2;
  let playerToBeDeltTo =
    game.dealer + 1 < game.players.length ? game.dealer + 1 : 0;
  const newDeck = game.deck.slice(0);
  for (let i = 0; i < cardsToDeal; i++) {
    const newCard = newDeck.pop();
    if (newCard) {
      game.players[playerToBeDeltTo].cards.push(newCard);
    }
    playerToBeDeltTo =
      playerToBeDeltTo + 1 < game.players.length ? playerToBeDeltTo + 1 : 0;
    console.log("player during deal: ", game.players);
  }
  game.deck = newDeck;
  return game;
};

export const dealFlopTurnRiver = (game: Poker) => {
  const cardsToDeal = game.stage === 1 ? 3 : 1;
  const newDeck = game.deck.slice(0);
  const discard = newDeck.pop();
  for (let i = 0; i < cardsToDeal; i++) {
    const newCard = newDeck.pop();
    if (newCard) {
      game.tableCards.push(newCard);
    }
  }
  game.deck = newDeck;
  return game;
};

const resetGame = (game: Poker) => {
  game.deck = generateDeck();
  for (let player of game.players) {
    player.cards = [];
    player.isActive = true;
    player.lastBet = 0;
  }
  game.tableCards = [];
  game.winner = [];
  game.stage = 0;
  game.currentBet = 20;
  game.dealer = game.dealer + 1 < game.players.length ? game.dealer + 1 : 0;
  return game;
};

const determineWinner = (game: Poker) => {
  const playerHands = game.players
    .filter((player) => player.isActive)
    .map(({ cards }) =>
      Hand.solve([...game.tableCards, ...cards].map((card) => card.value))
    );
  const solvedCardPools = playerHands.map((hand) =>
    hand.cards.map((card: any) => card.value + card.suit)
  );
  //const game1 = Hand.solve(["Ad", "As", "Jc", "Th", "2d", "3c", "Kd"]);
  //const game2 = Hand.solve(["Ad", "As", "Jc", "Th", "2d", "Qs", "Qd"]);
  const winningHand = Hand.winners(playerHands);
  //game.winner = Hand.winners(playerHands);
  let winningIndexes = [];
  const winningCardPool = winningHand[0].cards.map(
    (card: any) => card.value + card.suit
  );
  //   const winningCardPool = winningHand.cardPool;
  for (let i = 0; i < playerHands.length; i++) {
    console.log(
      "Checking all card pools: ",
      solvedCardPools[i],
      winningCardPool,
      winningCardPool === solvedCardPools[i]
    );
    if (isEqual(winningCardPool, solvedCardPools[i])) {
      winningIndexes.push(i);
    }
  }

  game.winner = winningIndexes;
};

const distributeWinnings = (game: Poker) => {
  const numberOfWinners = game.winner.length;
  const remainder = game.pot % numberOfWinners;
  for (let winner of game.winner) {
    game.players[winner].stack += (game.pot - remainder) / numberOfWinners;
  }
  game.pot = remainder;
  //Todo: handle side pots etc;
};

export const advanceGameStage = (game: Poker) => {
  //console.log("advancing gameStage!", game);
  const newGame = cloneDeep(game);
  if (newGame.stage === 0) {
    dealPreFlop(newGame);
    newGame.stage += 1;
  } else if (newGame.stage < 4) {
    dealFlopTurnRiver(newGame);
    newGame.stage += 1;
  } else if (newGame.stage === 4) {
    determineWinner(newGame);
    distributeWinnings(newGame);
    newGame.stage += 1;
    setTimeout(() => {
      resetGame(newGame);
    }, 3000);
    // game.stage = 5;
    //resetGame(newGame);
  } else if (newGame.stage === 5) {
  }
  newGame.currentBet = 0;
  for (let player of newGame.players) {
    player.lastBet = 0;
    player.checked = false;
  }
  //console.log("done advancing game stage!", game);
  return newGame;
};
