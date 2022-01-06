import React, { useState } from "react";
import { CardType } from "./types";
import Hand from "./Hand";
import styled from "@emotion/styled";

interface Props {
  tableCards: Array<CardType>;
}

let TableHandContainer = styled.div`
  height: 200px;
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: green;
  margin: 0px 100px 20px 100px;
  border-radius: 25px;
`;

function Table({ tableCards }: Props): JSX.Element {
  return (
    <div className="Table">
      <h1>Table</h1>
      <TableHandContainer>
        <Hand hand={tableCards} />
      </TableHandContainer>
    </div>
  );
}

export default Table;
