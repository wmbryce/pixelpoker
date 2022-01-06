import React, { useState } from "react";
import { CardType } from "./types";
import styled from "@emotion/styled";

interface Props {
  card: CardType;
}

const suiteIcons: any = {
  s: `♠`,
  h: `♥`,
  c: `♣`,
  d: `♦`,
};

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
  background-color: white;
`;

let CardText = styled.div((props) => ({
  color: props.color,
}));

function Card({ card }: Props) {
  return (
    <CardContainer>
      <CardText
        color={card.suite === "h" || card.suite === "d" ? "red" : "black"}
      >{`${suiteIcons[card.suite]} ${card.label}`}</CardText>
    </CardContainer>
  );
}

export default Card;
