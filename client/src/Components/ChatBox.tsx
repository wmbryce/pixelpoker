import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";

//gets the data from the action object and reducers defined earlier
interface Props {
  username?: String;
  room?: String;
  Socket: any;
}
const ChatBoxContainer = styled.div`
  width: 90%;
  height: 100%;
  margin: 10px 10px 10px 10px;
  padding: 10px 10px 10px 10px;
`;

const MessageRowRecieved = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  border: 1px solid grey;
  border-radius: 5px;
  margin: 10px 300px 10px 0px;
  padding: 0px 20px;
  //width: 80%;
`;

const MessageRowSent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
  border: 1px solid grey;
  border-radius: 5px;
  margin: 10px 20px 10px 300px;
  padding: 0px 20px;
  //width: 70%;
`;

const MessageText = styled.p`
  font-size: 14px;
  color: black;
  margin-top: 10px;
`;

const MessageLabel = styled.p`
  font-size: 10px;
  color: grey;
  margin-top: -10px;
`;

function ChatBox({ username, room, Socket }: Props) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<any[]>([]);

  const dispatchProcess = (encrypt: any, msg: any, cipher: any) => {
    // process(encrypt, msg, cipher);
  };

  useEffect(() => {
    Socket.on("message", (data: any) => {
      //decypt the message
      //const ans = to_Decrypt(data.text, data.username);
      //dispatchProcess(false, ans, data.text);
      //console.log(ans);
      let temp: any[] = messages;
      temp.push(data);
      // {
      //   userId: data.userId,
      //   username: data.username,
      //   text: data.text,
      // });
      setMessages([...temp]);
    });
  }, [Socket]);

  const sendData = () => {
    if (text !== "") {
      //encrypt the message here
      //const ans = to_Encrypt(text);
      Socket.emit("chat", text);
      setText("");
    }
  };
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    //messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  //console.log(messages, "mess");

  return (
    <ChatBoxContainer>
      <div className="user-name">
        <h2>
          {username} <span style={{ fontSize: "0.7rem" }}>in {room}</span>
        </h2>
      </div>
      <div className="chat-message">
        {messages.map((i: any) => {
          if (i.username === username) {
            return (
              <MessageRowSent>
                <MessageText>{i.text}</MessageText>
                <MessageLabel>{i.username}</MessageLabel>
              </MessageRowSent>
            );
          } else {
            return (
              <MessageRowRecieved>
                <MessageText>{i.text} </MessageText>
                <MessageLabel>{i.username}</MessageLabel>
              </MessageRowRecieved>
            );
          }
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="send">
        <input
          placeholder="enter your message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              sendData();
            }
          }}
        ></input>
        <button onClick={sendData}>Send</button>
      </div>
    </ChatBoxContainer>
  );
}
export default ChatBox;
