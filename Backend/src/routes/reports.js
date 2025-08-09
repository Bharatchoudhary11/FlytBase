const express = require('express');
const { missions, drones, reports } = require('../dataStore');

const router = express.Router();

// Per-mission summary
//
// Originally this endpoint required the mission to still exist in the in-memory
// `missions` store. In practice reports might outlive their missions (e.g.
// after a server restart) which caused the API to respond with "Mission not
// found" even though a report was available.  This meant the frontend could
// never load a completed mission by id.  We now look up the report first and
// only fall back to mission data if it is present.  If the mission is missing we
// still return the report using its stored coverage information.
router.get('/missions/:id', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const mission = missions.get(req.params.id);
  const summary = {
    mission_id: report.mission_id,
    duration: report.duration,
    distance: report.distance,
    // If the mission has been purged fall back to the coverage value stored in
    // the report itself.
    waypoints: mission ? mission.waypoints.length : report.coverage,
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
