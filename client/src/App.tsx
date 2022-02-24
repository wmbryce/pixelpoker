import React, { useState, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { generateDeck } from "./Logic/deck";
import { advanceGameStage, initalizeGame } from "./Logic/gameplay";
import Table from "./Components/Table";
import Player from "./Components/Player";
import styled from "@emotion/styled";
import { Poker, gameStages } from "./Logic/types";
import { io } from "socket.io-client";

const Hand = require("pokersolver").Hand;
const SERVER = "http://localhost:8080/";

const socket = io();

let PlayerContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  margin: 16px 0px;
`;

function App() {
  const [game, setGame] = useState(initalizeGame);

  useEffect(() => {
    if (
      (game.currentBet > 0 &&
        game.currentBet === game.players[game.actionOn].lastBet) ||
      (game.currentBet === 0 && game.players[game.actionOn].checked)
    ) {
      const result = advanceGameStage(game);
      setGame(result);
    }
  }, [game]);

  const nextStep = () => {
    const result = advanceGameStage(game);
    setGame(result);
  };

  const saveNextGameState = (newGame: Poker) => {
    setGame(newGame);
  };

  return (
    <div className="App">
      <Table
        tableCards={game.tableCards}
        pot={game.pot}
        currentBet={game.currentBet}
      />
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
