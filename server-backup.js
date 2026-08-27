const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
  socket.on("createRoom", (callback) => {
    let code;

    do {
      code = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (rooms[code]);

    rooms[code] = {
      players: [socket.id],
      choices: {}
    };

    socket.join(code);

    callback({
      success: true,
      room: code,
      player: 1
    });
  });

  socket.on("joinRoom", (code, callback) => {
    code = code.toUpperCase();

    if (!rooms[code]) {
      return callback({
        success: false,
        message: "ไม่พบห้องนี้"
      });
    }

    if (rooms[code].players.length >= 2) {
      return callback({
        success: false,
        message: "ห้องเต็มแล้ว"
      });
    }

    rooms[code].players.push(socket.id);
    socket.join(code);

    callback({
      success: true,
      room: code,
      player: 2
    });

    io.to(code).emit("playersUpdate", {
      count: rooms[code].players.length
    });
  });

  socket.on("choice", ({ room, choice }) => {
    if (!rooms[room]) return;

    rooms[room].choices[socket.id] = choice;

    const players = rooms[room].players;

    if (players.length === 2 &&
        players.every(id => rooms[room].choices[id])) {

      const p1 = rooms[room].choices[players[0]];
      const p2 = rooms[room].choices[players[1]];

      let result;

      if (p1 === p2) {
        result = "เสมอ!";
      } else if (
        (p1 === "rock" && p2 === "scissors") ||
        (p1 === "scissors" && p2 === "paper") ||
        (p1 === "paper" && p2 === "rock")
      ) {
        result = "ผู้เล่น 1 ชนะ!";
      } else {
        result = "ผู้เล่น 2 ชนะ!";
      }

      io.to(room).emit("result", {
        p1,
        p2,
        result
      });

      rooms[room].choices = {};
    }
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      const index = rooms[room].players.indexOf(socket.id);

      if (index !== -1) {
        rooms[room].players.splice(index, 1);

        io.to(room).emit("playersUpdate", {
          count: rooms[room].players.length
        });

        if (rooms[room].players.length === 0) {
          delete rooms[room];
        }
      }
    }
  });
});

server.listen(8080, "0.0.0.0", () => {
  console.log("RPS Server running on port 8080");
});
