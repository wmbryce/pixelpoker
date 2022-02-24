import React, { useState, useEffect } from "react";
import { advanceGameStage, initalizeGame } from "../Logic/gameplay";
import Table from "./Table";
import Player from "./Player";
import styled from "@emotion/styled";
import { Poker, gameStages } from "../Logic/types";

let PlayerContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  margin: 16px 0px;
`;

let RootContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 16px 0px;
  text-align: center;
`;

function GameContainer() {
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
    <RootContainer>
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
    </RootContainer>
  );
}

export default GameContainer;
