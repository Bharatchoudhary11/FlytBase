// src/server.js

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
require("dotenv").config();
const { missions, drones } = require("./dataStore");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware setup
app.use(cors());
app.use(express.json());
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next();
});

// Routes

const createMissionsRouter = require('./routes/missions');
const createDronesRouter = require('./routes/drones');
const reportsRouter = require('./routes/reports');

app.use('/missions', createMissionsRouter(io));
app.use('/drones', createDronesRouter(io));
app.use('/reports', reportsRouter);



// Basic route to check server and list missions and drones
app.get("/", (req, res) => {
  res.json({
    message: "Drone Survey Management System Backend",
    missions: Array.from(missions.values()),
    drones: Array.from(drones.values())
  });
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
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
