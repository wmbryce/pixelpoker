import React, { useState } from "react";
import { CardType } from "./types";
import styled from "@emotion/styled";

interface Props {
  card: CardType;
}

let CardContainer = styled.div`
  border: 1px solid black;
  border-radius: 4px;
  padding: 0px 6px;
  margin: 0px 6px;
  width: 60px;
  height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

function Card({ card }: Props) {
  return (
    <CardContainer>
      <h2>{`${card.suite} ${card.label}`}</h2>
    </CardContainer>
  );
}

export default Card;
