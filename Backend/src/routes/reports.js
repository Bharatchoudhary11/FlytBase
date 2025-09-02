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
      const sensorList = mission ? mission.sensors : report.sensors || [];
      const distance =
        report.distance && report.distance > 0
          ? report.distance
          : mission
          ? mission.distanceTraveled || mission.totalDistance || 0
          : 0;
      const summary = {
        mission_id: report.mission_id,
        status: mission ? mission.status : report.status || null,
        failure_reason: mission ? mission.failureReason : report.failure_reason || null,
        duration: report.duration,
        distance,
        // If the mission has been purged fall back to the coverage value stored in
        // the report itself.
        waypoints: mission ? mission.waypoints.length : report.coverage,
        created_at: report.created_at,
        start_time: report.start_time,
        end_time: report.end_time,
        data_frequency: mission ? mission.dataFrequency : report.data_frequency,
        sensors: sensorList.map(s => s.name || s)
      };
      return res.json(summary);
    }

  // If there's no report yet, expose whatever mission data we have. This is
  // especially useful for missions that are planned or in progress.
    const sensorList = mission.sensors || [];
    const summary = {
      mission_id: mission.id,
      status: mission.status,
      failure_reason: mission.failureReason,
      duration:
        mission.startTime && mission.endTime
          ? (mission.endTime - mission.startTime) / 1000
          : null,
      distance: mission.distanceTraveled || mission.totalDistance || 0,
      waypoints: mission.waypoints ? mission.waypoints.length : 0,
      created_at: null,
      start_time: mission.startTime ? new Date(mission.startTime).toISOString() : null,
      end_time: mission.endTime ? new Date(mission.endTime).toISOString() : null,
      data_frequency: mission.dataFrequency,
      sensors: sensorList.map(s => s.name || s)
    };
    res.json(summary);
  });

// Org-wide analytics
router.get('/org', (_req, res) => {
  const allMissions = Array.from(missions.values());
  const totalMissions = allMissions.length;
  const successes = allMissions.filter(m => m.status === 'completed').length;
  const batteryFailures = allMissions.filter(
    m => m.status === 'failed' && m.failureReason === 'battery'
  ).length;
  const damageFailures = allMissions.filter(
    m => m.status === 'failed' && m.failureReason === 'damage'
  ).length;
  const dronesArr = Array.from(drones.values());
  const averageBattery = dronesArr.length
    ? dronesArr.reduce((sum, d) => sum + d.battery, 0) / dronesArr.length
    : 0;
  const missionSuccessRate = totalMissions ? successes / totalMissions : 0;
  res.json({
    totalMissions,
    averageBattery,
    missionSuccessRate,
    missionOutcomes: {
      success: successes,
      batteryFailure: batteryFailures,
      damageFailure: damageFailures
    }
  });
});

module.exports = router;
