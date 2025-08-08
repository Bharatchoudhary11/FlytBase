// src/server.js

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware setup
app.use(cors());
app.use(express.json());

// Routes
const missionsRouter = require('./routes/missions');

const createDronesRouter = require('./routes/drones');

app.use('/missions', missionsRouter);
app.use('/drones', createDronesRouter(io));


// Basic route to check server
app.get("/", (req, res) => {
  res.send("Drone Survey Management System Backend");
});

// WebSocket setup (real-time updates for drone status)
io.on("connection", (socket) => {
  console.log("A user connected");
  socket.emit("message", "Welcome to Drone Survey System!");

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
