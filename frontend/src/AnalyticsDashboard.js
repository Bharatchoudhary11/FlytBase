import React, { useEffect, useRef, useState } from 'react';

// Allow the backend API base URL to be configured at build time.  When the
// frontend is served from a different origin than the backend (e.g. the React
// dev server on port 3000 proxying to an API on port 5001) we need to prefix
// all requests with the backend host.  In production the variable can be left
// unset so that relative URLs continue to work when both services share the
// same origin.
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

function AnalyticsDashboard() {
  const [orgStats, setOrgStats] = useState(null);
  const chartRef = useRef(null);
  // Keep a reference to the current Chart.js instance so we can
  // destroy it before creating a new one. This avoids the
  // "Canvas is already in use" error when the component rerenders.
  const chartInstanceRef = useRef(null);
  const [missionId, setMissionId] = useState('');
  const [missionSummary, setMissionSummary] = useState(null);
  const [missionError, setMissionError] = useState(null);

  const fetchJson = (url) =>
    fetch(`${API_BASE_URL}${url}`).then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await res.json() : null;
      if (!res.ok) {
        const message = data && data.error ? data.error : `Request failed with ${res.status}`;
        throw new Error(message);
      }
      if (!isJson) {
        throw new Error(`Expected JSON but received ${contentType}`);
      }
      return data;
    });

  useEffect(() => {
    let isCancelled = false;

    const load = () => {
      fetchJson('/reports/org')
        .then((stats) => {
          if (!isCancelled) {
            setOrgStats(stats);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error(err);
          }
        });
    };

    load();
    const intervalId = setInterval(load, 5000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!orgStats) return;
    if (!window.Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        try {
          drawChart(orgStats);
        } catch (err) {
          console.error('Error rendering chart', err);
        }
      };
      script.onerror = (err) => {
        console.error('Failed to load Chart.js', err);
      };
      document.body.appendChild(script);
    } else {
      drawChart(orgStats);
    }
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [orgStats]);

  function drawChart(stats) {
    const outcomes = stats.missionOutcomes || {
      success: 0,
      batteryFailure: 0,
      damageFailure: 0,
    };
    const data = [
      outcomes.success,
      outcomes.batteryFailure,
      outcomes.damageFailure,
    ];
    const labels = ['Success', 'Battery Failure', 'Damage Failure'];

    if (chartInstanceRef.current) {
      chartInstanceRef.current.data.datasets[0].data = data;
      chartInstanceRef.current.data.labels = labels;
      chartInstanceRef.current.update();
      return;
    }

    const ctx = chartRef.current.getContext('2d');
    chartInstanceRef.current = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56'],
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
            if (!missionId.trim()) {
              setMissionError('Please enter a mission ID');
              setMissionSummary(null);
              return;
            }
            fetchJson(`/reports/missions/${encodeURIComponent(missionId.trim())}`)
              .then((summary) => {
                setMissionSummary(summary);
                setMissionError(null);
              })
              .catch((err) => {
                setMissionSummary(null);
                setMissionError(err.message || 'Mission report not found');
              });
          }}
        >
          Load
        </button>
        {missionError && (
          <p style={{ color: 'red' }}>{missionError}</p>
        )}
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
