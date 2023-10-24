import React, { useState, useEffect } from "react";
import { CardType } from "./types";
import Hand from "./Hand";
import styled from "@emotion/styled";

interface Props {
  setupRoom: any;
}

let WelcomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  margin: 180px 100px;
  padding: 30px;
  height: 180px;
  border: 1px solid black;
  border-radius: 20px;
`;

function WelcomeView({ setupRoom }: Props): JSX.Element {
  //activates joinRoom function defined on the backend
  const [userId, setUserId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [errors, setErrors] = useState({});

  const verifyAndSetupUser = () => {
    const newErrors = [];
    if (userId.length === 0) {
      newErrors.push("User Id must have a length greater than zero.");
    }
    if (roomId.length === 0) {
      newErrors.push("Room Id must have a length greater than zero.");
    }
    if (newErrors.length === 0) {
      setupRoom(userId, roomId);
      setErrors(newErrors);
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <WelcomeContainer>
      <h1>Welcome</h1>
      <input
        placeholder="Input your user name"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
      <input
        placeholder="Input the room name"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <button onClick={verifyAndSetupUser}>Join</button>
    </WelcomeContainer>
  );
}

export default WelcomeView;
