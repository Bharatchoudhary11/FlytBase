const express = require('express');
const { v4: uuidv4 } = require('uuid');

// Create a router factory so we can emit WebSocket events
function createMissionsRouter(io) {
  const router = express.Router();
  const missions = new Map();

  // Create a new mission
  router.post('/', (req, res) => {
    const { orgId, name, area, altitude, pattern, overlap } = req.body;
    if (!orgId || !name || !area || !altitude || !pattern) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (area.type !== 'Polygon' || !Array.isArray(area.coordinates)) {
      return res.status(400).json({ error: 'Area must be a GeoJSON Polygon' });
    }

    const id = uuidv4();
    const polygon = area.coordinates[0];
    const waypoints = generateWaypoints(polygon, altitude, pattern, overlap);

    const mission = {
      id,
      orgId,
      name,
      area,
      altitude,
      pattern,
      overlap,
      status: 'planned',
      waypoints,
      trajectory: [],
      completedWaypoints: 0,
      distanceTraveled: 0,
      totalDistance: pathLength(waypoints),
      startTime: null,
      progress: 0,
      eta: null
    };

    missions.set(id, mission);
    res.status(201).json(mission);
  });

  // Retrieve mission details
  router.get('/:id', (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(mission);
  });

  // Accept telemetry updates and broadcast over WebSocket
  router.post('/:id/telemetry', (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const point = { lat, lng };
    if (mission.trajectory.length > 0) {
      mission.distanceTraveled += haversine(
        mission.trajectory[mission.trajectory.length - 1],
        point
      );
    }
    mission.trajectory.push(point);

    // Mark waypoint completion when within 5 meters of the next waypoint
    const nextWp = mission.waypoints[mission.completedWaypoints];
    if (nextWp && haversine(point, nextWp) < 5) {
      mission.completedWaypoints++;
    }

    if (!mission.startTime) {
      mission.startTime = Date.now();
      mission.status = 'in_progress';
      io.emit(`mission/${mission.id}/events`, {
        status: mission.status,
        progress: mission.progress,
        eta: mission.eta
      });
    }

    mission.progress =
      mission.waypoints.length === 0
        ? 0
        : mission.completedWaypoints / mission.waypoints.length;

    const elapsed = (Date.now() - mission.startTime) / 1000; // seconds
    const speed = mission.distanceTraveled / (elapsed || 1); // m/s
    const remaining = mission.totalDistance * (1 - mission.progress);
    mission.eta = speed > 0 ? remaining / speed : null;

    io.emit(`mission/${mission.id}/telemetry`, point);
    io.emit(`mission/${mission.id}/events`, {
      status: mission.status,
      progress: mission.progress,
      eta: mission.eta
    });

    if (mission.completedWaypoints >= mission.waypoints.length) {
      mission.status = 'completed';
      mission.eta = 0;
      io.emit(`mission/${mission.id}/events`, {
        status: mission.status,
        progress: 1,
        eta: 0
      });
    }

    res.json({ status: mission.status, progress: mission.progress, eta: mission.eta });
  });

  // Mission control commands: pause, resume, abort
  router.post('/:id/commands', (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    const { action } = req.body;
    if (!['pause', 'resume', 'abort'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (action === 'pause' && mission.status === 'in_progress') {
      mission.status = 'paused';
    } else if (action === 'resume' && mission.status === 'paused') {
      mission.status = 'in_progress';
    } else if (action === 'abort' && mission.status !== 'completed' && mission.status !== 'aborted') {
      mission.status = 'aborted';
    } else {
      return res.status(400).json({ error: 'Action not allowed in current state' });
    }

    io.emit(`mission/${mission.id}/events`, {
      status: mission.status,
      progress: mission.progress,
      eta: mission.eta
    });

    res.json({ status: mission.status });
  });

  return router;
}

// Generate waypoints based on pattern
function generateWaypoints(coords, altitude, pattern, overlap) {
  const spacing = overlap || 0.001; // degree spacing for demo
  const polygon = coords.map(([lng, lat]) => ({ lng, lat }));
  if (
    polygon[0].lng !== polygon[polygon.length - 1].lng ||
    polygon[0].lat !== polygon[polygon.length - 1].lat
  ) {
    polygon.push({ ...polygon[0] });
  }

  if (pattern === 'perimeter') {
    return polygon.map((p) => ({ lat: p.lat, lng: p.lng, altitude }));
  }

  const [minLng, minLat, maxLng, maxLat] = getBoundingBox(polygon);
  const points = [];
  let lineCount = 0;

  if (pattern === 'grid' || pattern === 'crosshatch') {
    for (let y = minLat; y <= maxLat; y += spacing) {
      const segments = horizontalIntersections(polygon, y);
      segments.forEach(([startLng, endLng]) => {
        if (lineCount % 2 === 0) {
          points.push({ lat: y, lng: startLng, altitude });
          points.push({ lat: y, lng: endLng, altitude });
        } else {
          points.push({ lat: y, lng: endLng, altitude });
          points.push({ lat: y, lng: startLng, altitude });
        }
        lineCount++;
      });
    }
  }

  if (pattern === 'crosshatch') {
    for (let x = minLng; x <= maxLng; x += spacing) {
      const segments = verticalIntersections(polygon, x);
      segments.forEach(([startLat, endLat]) => {
        points.push({ lat: startLat, lng: x, altitude });
        points.push({ lat: endLat, lng: x, altitude });
      });
    }
  }

  return points;
}

function getBoundingBox(poly) {
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;
  poly.forEach((p) => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  });
  return [minLng, minLat, maxLng, maxLat];
}

function horizontalIntersections(polygon, y) {
  const lngs = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.lat <= y && b.lat > y) || (b.lat <= y && a.lat > y)) {
      if (a.lat !== b.lat) {
        const lng = a.lng + ((y - a.lat) * (b.lng - a.lng)) / (b.lat - a.lat);
        lngs.push(lng);
      }
    }
  }
  lngs.sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < lngs.length; i += 2) {
    if (lngs[i + 1] !== undefined) {
      segments.push([lngs[i], lngs[i + 1]]);
    }
  }
  return segments;
}

function verticalIntersections(polygon, x) {
  const lats = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.lng <= x && b.lng > x) || (b.lng <= x && a.lng > x)) {
      if (a.lng !== b.lng) {
        const lat = a.lat + ((x - a.lng) * (b.lat - a.lat)) / (b.lng - a.lng);
        lats.push(lat);
      }
    }
  }
  lats.sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < lats.length; i += 2) {
    if (lats[i + 1] !== undefined) {
      segments.push([lats[i], lats[i + 1]]);
    }
  }
  return segments;
}

// Distance between two lat/lng points in meters
function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000; // metres
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += haversine(points[i - 1], points[i]);
  }
  return length;
}

module.exports = createMissionsRouter;

