const express = require('express');
const { v4: uuidv4 } = require('uuid');

function createDronesRouter(io) {
  const router = express.Router();
  const drones = new Map();
  const validStatuses = ['available', 'charging', 'in_mission', 'maintenance'];

  // Register a new drone
  router.post('/', (req, res) => {
    const { orgId, model, battery } = req.body;
    if (!orgId || !model || battery === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const id = uuidv4();
    const drone = {
      id,
      orgId,
      model,
      battery,
      status: 'available',
      lastHeartbeat: new Date().toISOString()
    };
    drones.set(id, drone);
    io.emit('drone-status', drone);
    res.status(201).json(drone);
  });

  // List all drones
  router.get('/', (_req, res) => {
    res.json(Array.from(drones.values()));
  });

  // Update drone status or battery
  router.patch('/:id/status', (req, res) => {
    const drone = drones.get(req.params.id);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });
    const { status, battery } = req.body;
    if (!status && battery === undefined) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status) drone.status = status;
    if (battery !== undefined) drone.battery = battery;
    drone.lastHeartbeat = new Date().toISOString();
    io.emit('drone-status', drone);
    res.json(drone);
  });

  return router;
}

module.exports = createDronesRouter;
