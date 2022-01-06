import React, { useState, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { generateDeck } from "./Logic/deck";
import Table from "./Components/Table";
import Player from "./Components/Player";
import styled from "@emotion/styled";

const gameStages = ["Pre-flop", "Flop", "Turn", "River"];
const playersInit = [
  { name: "Michael", stack: 100, hand: [] },
  { name: "Computer", stack: 100, hand: [] },
];

let PlayerContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  margin: 16px 0px;
`;

function App() {
  const [deck, setDeck] = useState<any[]>(generateDeck());
  const [players, setPlayers] = useState<any[]>([
    { name: "Michael", stack: 100, hand: [] },
    { name: "Computer", stack: 100, hand: [] },
  ]);
  const [myPlayerNumber, setMyPlayerNumber] = useState<number>(0);
  const [dealer, setDealer] = useState<number>(0);
  const [tableCards, setTableCards] = useState<any[]>([]);
  const [gameStage, setGameStage] = useState(0);

  const createPlayer = () => {
    const name = "michael";
    const stack = "100";
    const hand: Array<any> = [];
    setPlayers([...players, { name, stack, hand }]);
  };

  const dealPreFlop = () => {
    const cardsToDeal = players.length * 2;
    let playerToBeDeltTo = dealer + 1 < players.length ? dealer + 1 : 0;
    const newDeck = deck.slice(0);
    for (let i = 0; i < cardsToDeal; i++) {
      players[playerToBeDeltTo].hand.push(newDeck.pop());
      playerToBeDeltTo =
        playerToBeDeltTo + 1 < players.length ? playerToBeDeltTo + 1 : 0;
      console.log("player during deal: ", players);
    }
    setDeck(newDeck);
  };

  const dealFlopTurnRiver = () => {
    const cardsToDeal = gameStage === 1 ? 3 : 1;
    const newDeck = deck.slice(0);
    const discard = newDeck.pop();
    for (let i = 0; i < cardsToDeal; i++) {
      tableCards.push(newDeck.pop());
    }
    setDeck(newDeck);
  };

  const resetGame = () => {
    setDeck(generateDeck());
    for (let player of players) {
      player.hand = [];
    }
    setTableCards([]);
    setGameStage(0);
    setDealer(dealer + 1 < players.length ? dealer + 1 : 0);
  };

  const advanceGameStage = () => {
    if (gameStage === 0) {
      dealPreFlop();
      setGameStage(1);
    } else if (gameStage > 3) {
      resetGame();
    } else {
      dealFlopTurnRiver();
      setGameStage(gameStage + 1);
    }
  };

  const dealCardsToTable = () => {
    console.log("dealCardsToTable");
  };

  console.log("deck: ", deck);

  return (
    <div className="App">
      <Table tableCards={tableCards} />
      <div>
        <button onClick={advanceGameStage}>
          {gameStage < 4 ? `Deal ${gameStages[gameStage]}` : `Reset`}
        </button>
        <PlayerContainer>
          {players.map((player: any, index: number) => (
            <Player player={player} index={index} dealer={dealer} />
          ))}
        </PlayerContainer>
        {/* <button onClick={createPlayer}>Add Player</button> */}
      </div>
    </div>
  );
}

export default App;
