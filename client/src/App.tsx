import React, { useState, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import ChatContainer from "./Components/ChatContainer";
import GameContainer from "./Components/GameContainer";
import styled from "@emotion/styled";
import { io } from "socket.io-client";

const Hand = require("pokersolver").Hand;
const SERVER = "http://localhost:8000/";

const socket = io(SERVER);

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
  return (
    <AppContainer>
      <GameContainer />
      <ChatContainer Socket={socket} />
    </AppContainer>
  );
}

export default App;
