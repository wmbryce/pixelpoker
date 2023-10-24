export const joinRoom = (Socket: any, username: string, room: string) => {
  if (username !== "" && room !== "") {
    Socket.emit("joinRoom", { username, room });
    //if empty error message pops up and returns to the same page
  } else {
    alert("username and roomname are must !");
    window.location.reload();
  }
};
