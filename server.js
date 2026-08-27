const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

app.use(session({
  secret: "DPCHUB_SECRET_2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

const USERS_FILE = "./users.json";

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// สมัครสมาชิก
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      success: false,
      message: "กรุณากรอกข้อมูลให้ครบ"
    });
  }

  if (username.length < 3) {
    return res.json({
      success: false,
      message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัว"
    });
  }

  if (password.length < 6) {
    return res.json({
      success: false,
      message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัว"
    });
  }

  const users = loadUsers();

  if (users.some(u =>
    u.username.toLowerCase() === username.toLowerCase()
  )) {
    return res.json({
      success: false,
      message: "ชื่อผู้ใช้นี้มีอยู่แล้ว"
    });
  }

  users.push({
    username,
    password: hashPassword(password)
  });

  saveUsers(users);

  res.json({
    success: true,
    message: "สมัครสมาชิกสำเร็จ"
  });
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const users = loadUsers();

  const user = users.find(u =>
    u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user || user.password !== hashPassword(password)) {
    return res.json({
      success: false,
      message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
    });
  }

  req.session.user = {
    username: user.username
  };

  res.json({
    success: true,
    message: "เข้าสู่ระบบสำเร็จ"
  });
});

// หน้าเว็บ
app.use(express.static("public"));

// หน้าเกมต้อง Login ก่อน
app.get("/game.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/");
  }

  res.sendFile(__dirname + "/public/game.html");
});


// ===============================
// ระบบห้องเกม
// ===============================

const rooms = {};

function generateRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();
  } while (rooms[code]);

  return code;
}

io.on("connection", (socket) => {

  // สร้างห้อง
  socket.on("createRoom", (callback) => {

    const room = generateRoomCode();

    rooms[room] = {
      players: [socket.id],
      choices: {}
    };

    socket.join(room);

    callback({
      success: true,
      room: room,
      player: 1
    });

    console.log("สร้างห้อง:", room);
  });


  // เข้าห้อง
  socket.on("joinRoom", (code, callback) => {

    code = String(code).toUpperCase().trim();

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

    console.log("เข้าห้อง:", code);
  });


  // เลือกเป่ายิ้งฉุบ
  socket.on("choice", ({ room, choice }) => {

    if (!rooms[room]) return;

    if (!["rock", "paper", "scissors"].includes(choice)) {
      return;
    }

    rooms[room].choices[socket.id] = choice;

    const players = rooms[room].players;

    if (
      players.length === 2 &&
      players.every(id => rooms[room].choices[id])
    ) {

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
        p1: p1,
        p2: p2,
        result: result
      });

      rooms[room].choices = {};
    }
  });


  // ออกจากเกม
  socket.on("disconnect", () => {

    for (const room in rooms) {

      const index =
        rooms[room].players.indexOf(socket.id);

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
