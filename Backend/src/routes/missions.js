const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { missions, reports } = require('../dataStore');

// Assumed constant drone speed (meters per second) used for time estimates
const DEFAULT_SPEED_MPS = 10;

// Create a router factory so we can emit WebSocket events
function createMissionsRouter(io) {
  const router = express.Router();

  // Normalize the various coordinate formats the client may send.
  // Supports arrays, objects keyed by index, and even objects whose values
  // are themselves arrays of points. The result is always a flat array of
  // coordinate points.
  function normalizeCoords(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return Array.isArray(input[0]) && Array.isArray(input[0][0])
        ? input[0]
        : input;
    }
    if (typeof input === 'object') {
      const values = Object.values(input);
      return Array.isArray(values[0]) && Array.isArray(values[0][0])
        ? values[0]
        : values;
    }
    return [];
  }

  // Create a new mission
  router.post('/', (req, res) => {
    const {
      orgId,
      name,
      area,
      altitude,
      pattern,
      overlap,
      dataFrequency,
      sensors
    } = req.body;

    if (!orgId || !name || !area || !altitude || !pattern) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const areaType = (area.type || '').toLowerCase();
    const rawCoords = normalizeCoords(area.coordinates);
    if (areaType !== 'polygon' && areaType !== 'square') {
      return res
        .status(400)
        .json({ error: 'Area must specify type Polygon or Square' });
    }
    if (!rawCoords.length) {
      return res
        .status(400)
        .json({ error: 'Area must be a GeoJSON Polygon or Square' });
    }
    area.type = areaType.charAt(0).toUpperCase() + areaType.slice(1);

    if (
      dataFrequency !== undefined &&
      (typeof dataFrequency !== 'number' || dataFrequency <= 0)
    ) {
      return res
        .status(400)
        .json({ error: 'dataFrequency must be a positive number' });
    }
    if (sensors !== undefined && !Array.isArray(sensors)) {
      return res.status(400).json({ error: 'sensors must be an array' });
    }

    const id = uuidv4();
    // Support GeoJSON-style coordinate arrays as well as simple arrays or
    // objects of {lat,lng} points that may come from the frontend. Any shape
    // we cannot interpret is treated as an error instead of crashing.
    const waypoints = generateWaypoints(rawCoords, altitude, pattern, overlap);
    if (!waypoints.length) {
      return res
        .status(400)
        .json({ error: 'Unable to generate waypoints from provided area' });
    }

    const totalDistance = pathLength(waypoints);
    const start = Date.now();
    const duration = totalDistance / DEFAULT_SPEED_MPS; // seconds

    const mission = {
      id,
      orgId,
      name,
      area,
      altitude,
      pattern,
      overlap,
      dataFrequency: dataFrequency || 1,
      sensors: sensors || [],
      status: 'planned',
      waypoints,
      trajectory: [],
      completedWaypoints: 0,
      distanceTraveled: 0,
      totalDistance,
      startTime: start,
      endTime: start + duration * 1000,
      progress: 0,
      eta: duration,
      failureReason: null
    };

    missions.set(id, mission);
    io.emit('mission-created', mission);
    console.log('Mission created', id);
    res.status(201).json(mission);
  });

  // List all missions
  router.get('/', (_req, res) => {
    res.json(Array.from(missions.values()));
  });

  // Retrieve mission details
  router.get('/:id', (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    res.json(mission);
  });

  // Update an existing mission. This is a lightweight PATCH handler mainly
  // used by tests or development tools to fast‑forward a mission to a final
  // state without streaming telemetry. Any fields provided in the request body
  // replace the corresponding mission properties. If the mission is marked as
  // completed and no report exists yet, a summary report is generated so that
  // the `/reports/missions/:id` endpoint will succeed.
  router.patch('/:id', (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    Object.assign(mission, req.body);

    if (mission.status === 'completed') {
      const end = mission.endTime ? new Date(mission.endTime).getTime() : Date.now();
      const start = mission.startTime
        ? new Date(mission.startTime).getTime()
        : end - (mission.totalDistance / DEFAULT_SPEED_MPS) * 1000;
      mission.startTime = start;
      mission.endTime = end;

      if (!reports.has(mission.id)) {
        const report = {
          mission_id: mission.id,
          duration: (mission.endTime - mission.startTime) / 1000,
          distance: mission.distanceTraveled || 0,
          coverage: mission.waypoints ? mission.waypoints.length : 0,
          created_at: new Date().toISOString(),
          start_time: new Date(mission.startTime).toISOString(),
          end_time: new Date(mission.endTime).toISOString(),
          data_frequency: mission.dataFrequency,
          sensors: mission.sensors,
          status: mission.status,
          failure_reason: mission.failureReason
        };
        reports.set(mission.id, report);
      }
    } else if (mission.status === 'failed') {
      mission.endTime = mission.endTime || Date.now();
      mission.eta = null;
    }

    io.emit(`mission/${mission.id}/events`, {
      status: mission.status,
      progress: mission.progress,
      eta: mission.eta
    });

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

    if (mission.status === 'planned') {
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
      mission.endTime = Date.now();
      const report = {
        mission_id: mission.id,
        duration: (mission.endTime - mission.startTime) / 1000,
        distance: mission.distanceTraveled,
        coverage: mission.waypoints.length,
        created_at: new Date().toISOString(),
        start_time: new Date(mission.startTime).toISOString(),
        end_time: new Date(mission.endTime).toISOString(),
        data_frequency: mission.dataFrequency,
        sensors: mission.sensors
      };
      reports.set(mission.id, report);
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
      mission.endTime = Date.now();
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
  // Accept coordinates passed either as an array or an object with numeric keys
  const coordArray = Array.isArray(coords)
    ? coords
    : coords && typeof coords === 'object'
    ? Object.values(coords)
    : [];
  // Normalize coordinates and drop anything we can't interpret
  const polygon = coordArray
    .map((pt) =>
      Array.isArray(pt)
        ? { lng: pt[0], lat: pt[1] }
        : pt && typeof pt === 'object'
        ? { lng: Number(pt.lng), lat: Number(pt.lat) }
        : null
    )
    .filter((p) => p && !isNaN(p.lat) && !isNaN(p.lng));
  if (polygon.length === 0) return [];
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

      const segArray = Array.isArray(segments) ? segments : [];
      for (const seg of segArray) {
        // Each segment should represent a pair of longitude values.  Accept
        // either an array `[startLng, endLng]` or an object with numeric
        // `startLng/endLng` properties and skip anything we can't interpret.
        const pair = Array.isArray(seg)
          ? seg
          : seg && typeof seg === 'object'
          ? [seg[0] ?? seg.startLng, seg[1] ?? seg.endLng]
          : [];
        const [startLng, endLng] = pair;
        if (typeof startLng !== 'number' || typeof endLng !== 'number') continue;

        if (lineCount % 2 === 0) {
          points.push({ lat: y, lng: startLng, altitude });
          points.push({ lat: y, lng: endLng, altitude });
        } else {
          points.push({ lat: y, lng: endLng, altitude });
          points.push({ lat: y, lng: startLng, altitude });
        }
      }
      lineCount++;
    }
  }

  if (pattern === 'crosshatch') {
    for (let x = minLng; x <= maxLng; x += spacing) {
      const segments = verticalIntersections(polygon, x);

      const segArray = Array.isArray(segments) ? segments : [];
      for (const seg of segArray) {
        // Each segment is a pair of latitude values.  Accept either
        // `[startLat, endLat]` or an object with `startLat/endLat` fields.
        const pair = Array.isArray(seg)
          ? seg
          : seg && typeof seg === 'object'
          ? [seg[0] ?? seg.startLat, seg[1] ?? seg.endLat]
          : [];
        const [startLat, endLat] = pair;
        if (typeof startLat !== 'number' || typeof endLat !== 'number') continue;

        points.push({ lat: startLat, lng: x, altitude });
        points.push({ lat: endLat, lng: x, altitude });
      }
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
