const express = require('express');
const { missions, drones, reports } = require('../dataStore');

const router = express.Router();

// Per-mission summary
//
// The frontend allows a user to look up a mission by id even if the mission has
// already been purged from the in-memory `missions` store or a report has not
// yet been generated.  To make this work we first attempt to find a report for
// the given mission id. If one exists we return its data, falling back to any
// remaining mission details.  If no report exists we still try to surface basic
// mission information so users can view a "pre-mission" summary.  Only if both
// the report and mission are missing do we respond with a 404.
router.get('/missions/:id', (req, res) => {
  const missionId = req.params.id;
  const report = reports.get(missionId);
  const mission = missions.get(missionId);

  if (!report && !mission) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (report) {
    const summary = {
      mission_id: report.mission_id,
      duration: report.duration,
      distance: report.distance,
      // If the mission has been purged fall back to the coverage value stored in
      // the report itself.
      waypoints: mission ? mission.waypoints.length : report.coverage,
      created_at: report.created_at,
      start_time: report.start_time,
      end_time: report.end_time
    };
    return res.json(summary);
  }

  // If there's no report yet, expose whatever mission data we have. This is
  // especially useful for missions that are planned or in progress.
  const summary = {
    mission_id: mission.id,
    duration: null,
    distance: mission.distanceTraveled || 0,
    waypoints: mission.waypoints ? mission.waypoints.length : 0,
    created_at: null,
    start_time: mission.startTime ? new Date(mission.startTime).toISOString() : null,
    end_time: mission.endTime ? new Date(mission.endTime).toISOString() : null
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
