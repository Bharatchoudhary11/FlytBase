import React, { useEffect, useRef, useState } from 'react';

function AnalyticsDashboard() {
  const [orgStats, setOrgStats] = useState(null);
  const chartRef = useRef(null);
  const [missionId, setMissionId] = useState('');
  const [missionSummary, setMissionSummary] = useState(null);

  const fetchJson = (url) =>
    fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON but received ${contentType}`);
      }
      return res.json();
    });

  useEffect(() => {
    fetchJson('/reports/org')
      .then(setOrgStats)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!orgStats) return;
    if (!window.Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => drawChart(orgStats);
      document.body.appendChild(script);
    } else {
      drawChart(orgStats);
    }
  }, [orgStats]);

  function drawChart(stats) {
    const ctx = chartRef.current.getContext('2d');
    new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Success', 'Failure'],
        datasets: [
          {
            data: [stats.missionSuccessRate * 100, 100 - stats.missionSuccessRate * 100],
            backgroundColor: ['#36A2EB', '#FF6384'],
          },
        ],
      },
      options: { responsive: false },
    });
  }

  if (!orgStats) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Org-wide Analytics</h2>
      <p>Total Missions: {orgStats.totalMissions}</p>
      <p>Average Battery: {orgStats.averageBattery.toFixed(2)}%</p>
      <canvas ref={chartRef} width="300" height="200"></canvas>
      <div style={{ marginTop: '1rem' }}>
        <h3>Per-Mission Summary</h3>
        <input
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          placeholder="Mission ID"
        />
        <button
          onClick={() => {
            fetchJson(`/reports/missions/${missionId}`)
              .then(setMissionSummary)
              .catch(() => setMissionSummary(null));
          }}
        >
          Load
        </button>
        {missionSummary && (
          <ul>
            <li>Duration: {missionSummary.duration}s</li>
            <li>Distance: {missionSummary.distance.toFixed(2)}m</li>
            <li>Waypoints: {missionSummary.waypoints}</li>
          </ul>
        )}
      </div>
    </div>
  );
}

export default AnalyticsDashboard;
