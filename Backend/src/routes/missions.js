const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// In-memory stores for missions
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
  const mission = {
    id,
    orgId,
    name,
    area,
    altitude,
    pattern,
    overlap,
    status: 'planned'
  };

  mission.waypoints = generateWaypoints(polygon, altitude, pattern, overlap);
  missions.set(id, mission);
  res.status(201).json(mission);
});

// Retrieve mission details
router.get('/:id', (req, res) => {
  const mission = missions.get(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  res.json(mission);
});

// Generate waypoints based on pattern
function generateWaypoints(coords, altitude, pattern, overlap) {
  const spacing = overlap || 0.001; // degree spacing for demo
  const polygon = coords.map(([lng, lat]) => ({ lng, lat }));
  if (polygon[0].lng !== polygon[polygon.length - 1].lng || polygon[0].lat !== polygon[polygon.length - 1].lat) {
    polygon.push({ ...polygon[0] });
  }

  if (pattern === 'perimeter') {
    return polygon.map(p => ({ lat: p.lat, lng: p.lng, altitude }));
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
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  poly.forEach(p => {
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
        const lng = a.lng + (y - a.lat) * (b.lng - a.lng) / (b.lat - a.lat);
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
        const lat = a.lat + (x - a.lng) * (b.lat - a.lat) / (b.lng - a.lng);
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

module.exports = router;
