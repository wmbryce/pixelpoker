import React, { useState, useEffect } from "react";
import { PlayerType, Poker } from "../Logic/types";
import Hand from "./Hand";
import styled from "@emotion/styled";
import { raise, fold, call, nextPlayer } from "../Logic/actions";
import { cloneDeep } from "lodash";

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

let BetInput = styled.div`
  display: flex;
  flex-direction: row;
  height: 40px;
  align-items: center;
  justify-content: center;
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

  useEffect(() => {
    if (!player.isActive && index === game.actionOn) {
      const newGame = cloneDeep(game);
      newGame.actionOn = nextPlayer(newGame, index);
      saveGame(newGame);
    }
  }, [game]);

  const sendAction = (action: any) => {
    const { result, error } = action(game, index, bet);
    if (result) {
      result.actionOn = nextPlayer(result, index);
      console.log("result from action: ", action, result);
      saveGame(result);
    } else {
      setError(error);
    }
  };

  return (
    <div key={index}>
      <h2>{player.name}</h2>
      <h3>
        {index === dealer
          ? "Dealer"
          : index === dealer + 1 || dealer === game.players.length - 1
          ? "Small blind"
          : index === dealer + 2 || dealer === game.players.length - 2
          ? "Big blind"
          : " "}
      </h3>
      <h2>{player.stack}</h2>
      <Hand hand={player.cards} active={player.isActive} />
      {winner.includes(index) && <h3>Winner!</h3>}
      <Actions>
        <BetInput>
          <h3>Bet: </h3>
          <input
            type="number"
            min={game.currentBet}
            max={player.stack}
            //class="slider"
            onChange={(event: any) =>
              setBet(Number.parseInt(event.target.value))
            }
            value={bet}
            disabled={game.actionOn !== index}
          />
        </BetInput>
        <button
          onClick={() => sendAction(raise)}
          disabled={game.actionOn !== index}
        >
          Raise: {bet}
        </button>
        <button
          onClick={() => sendAction(call)}
          disabled={game.actionOn !== index}
        >
          Check/Call{" "}
        </button>
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
