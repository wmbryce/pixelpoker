import React, { useState } from "react";
import { PlayerType, Poker } from "../Logic/types";
import Hand from "./Hand";
import { playerBet } from "../Logic/gameplay";
import styled from "@emotion/styled";
import { raise, fold, nextPlayer } from "../Logic/playerActions";

interface Props {
  player: PlayerType;
  dealer: number;
  index: number;
  winner: Array<number>;
  game: Poker;
  saveGame: any;
}

let Actions = styled.div`
  display: flex;
  flex-direction: column;
  height: 120px;
  flex: 1;
  justify-content: space-around;
  align-items: center;
`;

function Player({
  player,
  dealer,
  index,
  winner,
  game,
  saveGame,
}: Props): JSX.Element {
  console.log("Checking for winner!", winner.includes(index), index, winner);
  const [bet, setBet] = useState(20);
  const [error, setError] = useState(null);

  const sendAction = (action: any) => {
    const { result, error } = action(game, index, bet);
    if (result) {
      result.actionOn = nextPlayer(game, index);
      saveGame(result);
    } else {
      setError(error);
    }
  };

  return (
    <div key={index}>
      <h2>{player.name}</h2>
      <h3>{index === dealer ? "dealer" : "player"}</h3>
      <h3>Bet: </h3>
      <h2>{player.stack}</h2>
      <Hand hand={player.cards} active={player.isActive} />
      {winner.includes(index) && <h3>Winner!</h3>}
      <Actions>
        <button
          onClick={() => sendAction(raise)}
          disabled={game.actionOn !== index}
        >
          Raise
        </button>
        <button disabled={game.actionOn !== index}>Check/Call </button>
        <button
          onClick={() => sendAction(fold)}
          disabled={game.actionOn !== index}
        >
          Fold
        </button>
      </Actions>
    </div>
  );
}

export default Player;
