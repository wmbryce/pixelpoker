import React, { useState } from "react";
import { CardType } from "./types";
import Hand from "./Hand";

interface Props {
  tableCards: Array<CardType>;
}

function Table({ tableCards }: Props): JSX.Element {
  return (
    <div className="Table">
      <h1>Table</h1>
      <Hand hand={tableCards} />
    </div>
  );
}

export default Table;
