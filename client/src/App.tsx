import React, { useState, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import ChatContainer from "./Components/ChatContainer";
import GameContainer from "./Components/GameContainer";
import WelcomeView from "./Components/WelcomeView";
import styled from "@emotion/styled";
import { io } from "socket.io-client";

const Hand = require("pokersolver").Hand;
const SERVER = "http://localhost:8000/";

const Socket = io(SERVER);

let AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  margin: 16px 0px;
`;

/*
 */

function App() {
  const [username, setUsername] = useState<any>(undefined);
  const [room, setRoom] = useState<any>(undefined);

  const setupRoom = (userId: string, roomId: string) => {
    if (userId && roomId) {
      Socket.emit("joinRoom", { username: userId, room: roomId });
      setUsername(userId);
      setRoom(roomId);
    }
  };

  console.log("username: ", username, "room: ", room);

  return (
    <AppContainer>
      {username && room ? (
        <>
          <GameContainer Socket={Socket} username={username} room={room} />
          <ChatContainer Socket={Socket} username={username} room={room} />
        </>
      ) : (
        <WelcomeView setupRoom={setupRoom} />
      )}
    </AppContainer>
  );
}

export default App;
