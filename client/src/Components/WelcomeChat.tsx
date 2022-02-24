import React, { useState } from "react";
import { CardType } from "./types";
import Hand from "./Hand";
import styled from "@emotion/styled";

interface Props {
  sendData: any;
  username: string;
  setUsername: any;
  roomname: string;
  setRoomName: any;
}

function Chat({
  sendData,
  username,
  setUsername,
  roomname,
  setRoomName,
}: Props): JSX.Element {
  //activates joinRoom function defined on the backend

  return (
    <>
      <h1>Welcome</h1>
      <input
        placeholder="Input your user name"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        placeholder="Input the room name"
        value={roomname}
        onChange={(e) => setRoomName(e.target.value)}
      />
      <button onClick={sendData}>Join</button>
    </>
  );
}

export default Chat;
