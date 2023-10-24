const rooms = [];

//Creates a new room
function create_room(roomId) {
  const new_room = { id, game, users };

  rooms.push(new_room);
  console.log("In create_room, rooms:", rooms);

  return new_room;
}

//Updates existing room
function get_room(id) {
  return rooms.find((room) => room.id === id);
}

// called when the user leaves the chat and its user object deleted from array
function user_Disconnect(id) {
  const index = c_users.findIndex((p_user) => p_user.id === id);

  if (index !== -1) {
    return c_users.splice(index, 1)[0];
  }
}

module.exports = {
  user_Disconnect,
  get_Current_User,
  join_User,
  c_users,
};
