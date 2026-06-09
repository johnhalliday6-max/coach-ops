import { useEffect, useState } from 'react';

function delayText(seconds) {
  const n = Number(seconds || 0);
  if (!Number.isFinite(n) || n <= 0) return 'Delay unknown';
  return `${Math.round(n / 60)} min delay`;
}

const UK_TRAFFIC_BBOX = '-8.65000,49.85000,1.90000,58.75000';

export default function TrafficLive({ selectedFleet, activeRoute }) {
  const [traffic, setTraffic] = useState({ loading: true, incidents: [], flow: null, error: '' });

  useEffect(() => {
    let cancelled = false;

    const buildUrl = () => {
      const routeLine = activeRoute?.geometry || [];
      if (routeLine.length > 1) {
        const lats = routeLine.map((point) => Number(point[0])).filter(Number.isFinite);
        const lngs = routeLine.map((point) => Number(point[1])).filter(Number.isFinite);
        if (lats.length && lngs.length) {
          const pad = 0.18;
          const bbox = [
            Math.min(...lngs) - pad,
            Math.min(...lats) - pad,
            Math.max(...lngs) + pad,
            Math.max(...lats) + pad,
          ].map((n) => n.toFixed(5)).join(',');
          return `/api/tomtom-traffic?bbox=${encodeURIComponent(bbox)}`;
        }
      }
      return `/api/tomtom-traffic?bbox=${encodeURIComponent(UK_TRAFFIC_BBOX)}`;
    };

    const loadTraffic = () => {
      fetch(buildUrl())
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (!data?.ok) {
            setTraffic({ loading: false, incidents: [], flow: null, error: data?.error || 'Traffic unavailable' });
            return;
          }
          setTraffic({ loading: false, incidents: data.incidents || [], flow: data.flow || null, error: '' });
        })
        .catch((error) => {
          if (!cancelled) setTraffic({ loading: false, incidents: [], flow: null, error: String(error) });
        });
    };

    loadTraffic();
    const timer = window.setInterval(loadTraffic, 90000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRoute?.updatedAt, selectedFleet?.fleetNo]);

  return (
    <section className="traffic-live-panel">
      <div className="traffic-live-title">
        <div>
          <h2>Live Traffic Intelligence</h2>
          <p>National Highways + TomTom traffic layer for the selected route.</p>
        </div>
        <strong>{selectedFleet?.fleetNo} / {selectedFleet?.reg}</strong>
      </div>

      {traffic.error && <p className="traffic-error">{traffic.error}</p>}
      {traffic.loading && <p>Loading traffic...</p>}

      {traffic.flow && (
        <div className="traffic-flow-card">
          <strong>Road flow near vehicle</strong>
          <span>Current {traffic.flow.currentSpeed ?? '--'} mph</span>
          <span>Free-flow {traffic.flow.freeFlowSpeed ?? '--'} mph</span>
          {traffic.flow.roadClosure && <span className="traffic-bad">Road closure reported</span>}
        </div>
      )}

      <div className="traffic-alert-grid">
        {(traffic.incidents || []).slice(0, 6).map((incident) => (
          <article className="traffic-alert-card" key={incident.id}>
            <strong>{incident.road}</strong>
            <p>{incident.detail || incident.title}</p>
            <small>{delayText(incident.delaySeconds)} · TomTom</small>
          </article>
        ))}
        {!traffic.loading && !traffic.error && traffic.incidents.length === 0 && (
          <article className="traffic-alert-card calm">
            <strong>No TomTom incidents found</strong>
            <p>No live TomTom incident returned for the current route/area.</p>
          </article>
        )}
      </div>
    </section>
  );
}
