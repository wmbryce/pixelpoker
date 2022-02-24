import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import WelcomeChat from "./WelcomeChat";
import ChatBox from "./ChatBox";

interface Props {
  Socket: any;
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

function Chat({ Socket }: Props): JSX.Element {
  const [username, setUsername] = useState("");
  const [roomname, setRoomName] = useState("");
  const [chatInitalized, setChatInitalized] = useState(false);

  //activates joinRoom function defined on the backend
  const sendData = () => {
    if (username !== "" && roomname !== "") {
      console.log("About to emit to socket: ", username, roomname);
      Socket.emit("joinRoom", { username, roomname });
      //if empty error message pops up and returns to the same page
    } else {
      alert("username and roomname are must !");
      window.location.reload();
    }
  };

  useEffect(() => {
    if (!chatInitalized) {
      Socket.on("message", (data: any) => {
        console.log("recieved data: ", data);
        setChatInitalized(true);
      });
    }
  }, [Socket]);

  return (
    <ChatContainer>
      {chatInitalized ? (
        <ChatBox Socket={Socket} username={username} roomname={roomname} />
      ) : (
        <WelcomeChat
          username={username}
          setUsername={setUsername}
          sendData={sendData}
          roomname={roomname}
          setRoomName={setRoomName}
        />
      )}
    </ChatContainer>
  );
}

export default Chat;
