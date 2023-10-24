import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import WelcomeChat from "./WelcomeView";
import ChatBox from "./ChatBox";

interface Props {
  Socket: any;
  username?: string;
  room?: string;
}

let ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  border: 1px solid black;
  border-radius: 8px;
  margin: 32px 32px 0px 32px;
  padding: 32px 0px;
`;

function Chat({ Socket, username, room }: Props): JSX.Element {
  const [chatInitalized, setChatInitalized] = useState(false);

  //activates joinRoom function defined on the backend
  const sendData = () => {
    if (username !== "" && room !== "") {
      console.log("About to emit to socket: ", username, room);
      Socket.emit("joinRoom", { username, room });
      //if empty error message pops up and returns to the same page
    } else {
      alert("username and roomname are must !");
      window.location.reload();
    }
  };

  return (
    <ChatContainer>
      <ChatBox Socket={Socket} username={username} room={room} />
    </ChatContainer>
  );
}

export default Chat;
