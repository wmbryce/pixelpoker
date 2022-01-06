import React, { useState } from "react";
import { CardType } from "./types";
import Card from "./Card";
import styled from "@emotion/styled";

interface Props {
  hand: Array<CardType>;
}

let HandContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

function Hand({ hand = [] }: Props): JSX.Element {
  return (
    <HandContainer>
      {hand.map((cardItem, index) => (
        <Card key={index} card={cardItem} />
      ))}
    </HandContainer>
  );
}

export default Hand;
