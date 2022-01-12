import React, { useState, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { generateDeck } from "./Logic/deck";
import { advanceGameStage, initalizeGame } from "./Logic/gameplay";
import Table from "./Components/Table";
import Player from "./Components/Player";
import styled from "@emotion/styled";
import { Poker, gameStages } from "./Logic/types";
const Hand = require("pokersolver").Hand;

const playersInit = [
  { name: "Michael", stack: 100, cards: [], isActive: true },
  { name: "Computer", stack: 100, cards: [], isActive: true },
];

let PlayerContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  margin: 16px 0px;
`;

function App() {
  const [game, setGame] = useState(initalizeGame);

  const nextStep = () => {
    const result = advanceGameStage(game);
    setGame(result);
  };

  const saveNextGameState = (newGame: Poker) => {
    setGame(newGame);
  };

  return (
    <div className="App">
      <Table tableCards={game.tableCards} pot={game.pot} />
      <div>
        <button onClick={nextStep}>
          {game.stage < 4
            ? `Deal ${gameStages[game.stage]}`
            : gameStages[game.stage]}
        </button>
        <PlayerContainer>
          {game.players.map((player: any, index: number) => (
            <Player
              player={player}
              index={index}
              game={game}
              saveGame={saveNextGameState}
              dealer={game.dealer}
              winner={game.winner}
            />
          ))}
        </PlayerContainer>
        {/* <button onClick={createPlayer}>Add Player</button> */}
      </div>
    </div>
  );
}

export default App;
