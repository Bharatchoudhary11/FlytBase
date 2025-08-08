const express = require('express');
const { missions, drones, reports } = require('../dataStore');

const router = express.Router();

// Per-mission summary
router.get('/missions/:id', (req, res) => {
  const mission = missions.get(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  const report = reports.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not available' });
  const summary = {
    mission_id: report.mission_id,
    duration: report.duration,
    distance: report.distance,
    waypoints: mission.waypoints.length,
    created_at: report.created_at
  };
  res.json(summary);
});

// Org-wide analytics
router.get('/org', (_req, res) => {
  const totalMissions = missions.size;
  const completed = Array.from(missions.values()).filter(m => m.status === 'completed').length;
  const dronesArr = Array.from(drones.values());
  const averageBattery = dronesArr.length
    ? dronesArr.reduce((sum, d) => sum + d.battery, 0) / dronesArr.length
    : 0;
  const missionSuccessRate = totalMissions ? completed / totalMissions : 0;
  res.json({ totalMissions, averageBattery, missionSuccessRate });
});

module.exports = router;
