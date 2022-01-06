import React, { useState } from "react";
import { PlayerType } from "./types";
import Hand from "./Hand";

interface Props {
  player: PlayerType;
  dealer: number;
  index: number;
}

function Player({ player, dealer, index }: Props): JSX.Element {
  return (
    <div key={index}>
      <h2>{player.name}</h2>
      <h3>{index === dealer ? "dealer" : "player"}</h3>
      <h2>{player.stack}</h2>
      <Hand hand={player.hand} />
    </div>
  );
}

export default Player;
