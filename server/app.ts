const express = require("express");
const http = require("http");
const socket = require("socket.io");
const color = require("colors");
const cors = require("cors");
const {
  get_Current_User,
  user_Disconnect,
  join_User,
} = require("./controllers/users");

const port = 8000;

const app = express();
const httpServer = http.createServer(app);
const io = new socket.Server(httpServer, {
  /* options */
  cors: {
    origin: "http://localhost:3000",
  },
});

httpServer.listen(
  port,
  console.log(`Server is running on the port no: ${port} `, color.green)
);

//initializing the socket io connection
io.on("connection", (socket) => {
  //for a new user joining the room
  socket.on("joinRoom", ({ username, roomname }) => {
    //* create user
    console.log("Join room! Wooo:", username, roomname);
    const p_user = join_User(socket.id, username, roomname);
    console.log(socket.id, "=id");
    socket.join(p_user.room);

    //display a welcome message to the user who have joined a room
    socket.emit("message", {
      userId: p_user.id,
      username: p_user.username,
      text: `Welcome ${p_user.username}`,
    });

    //displays a joined room message to all other room users except that particular user
    socket.broadcast.to(p_user.room).emit("message", {
      userId: p_user.id,
      username: p_user.username,
      text: `${p_user.username} has joined the chat`,
    });

    socket.emit("game", {
      userId: p_user.id,
    });
  });

  //user sending message
  socket.on("chat", (text) => {
    //gets the room user and the message sent
    const p_user = get_Current_User(socket.id);

    io.to(p_user.room).emit("message", {
      userId: p_user.id,
      username: p_user.username,
      text: text,
    });
  });

  //when the user exits the room
  socket.on("disconnect", () => {
    //the user is deleted from array of users and a left room message displayed
    const p_user = user_Disconnect(socket.id);

    if (p_user) {
      io.to(p_user.room).emit("message", {
        userId: p_user.id,
        username: p_user.username,
        text: `${p_user.username} has left the room`,
      });
    }
  });
});
