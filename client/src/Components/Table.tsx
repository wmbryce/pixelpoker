import React, { useState } from "react";
import { CardType } from "./types";
import Hand from "./Hand";
import styled from "@emotion/styled";

interface Props {
  tableCards: Array<CardType>;
  pot: number;
  currentBet: number;
}

let TableHandContainer = styled.div`
  height: 200px;
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  background-color: green;
  margin: 0px 100px 20px 100px;
  border-radius: 25px;
  padding: 16px;
`;

let TableText = styled.h2`
  color: white;
  font-size: 18px;
`;

let TableSubtext = styled.h2`
  color: white;
  font-size: 16px;
`;

function Table({ tableCards, pot, currentBet }: Props): JSX.Element {
  return (
    <div className="Table">
      <h1>Table</h1>
      <TableHandContainer>
        <Hand hand={tableCards} active={true} />
        <TableText>Pot: {pot}</TableText>
        <TableSubtext>Current bet: {currentBet}</TableSubtext>
      </TableHandContainer>
    </div>
  );
}

export default Table;
