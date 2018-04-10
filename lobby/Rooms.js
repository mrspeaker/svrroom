import Room from "./Room.js";

class Rooms {
  constructor() {
    this.rooms = new Map();
    this.rooms.set(Rooms.LOBBY, new Room(Rooms.LOBBY));
  }

  get lobby() {
    return this.rooms.get(Rooms.LOBBY);
  }

  addToLobby(client) {
    if (client.room) {
      client.room.leave(client);
    }
    this.rooms.get(Rooms.LOBBY).join(client);
    this.onEnterLobby && this.onEnterLobby(client);
  }

  add(name) {
    const room = new Room(name);
    this.rooms[name] = room;
    return room;
  }

  remove(name) {
    const room = this.rooms.get(name);
    if (!room || name === Rooms.LOBBY) return;
    room.clients.forEach(c => this.addToLobby(c));
    this.rooms.delete(name);
  }
}
Rooms.LOBBY = "lobby";

export default Rooms;
