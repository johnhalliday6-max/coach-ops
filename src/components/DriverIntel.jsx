import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "Unknown";

  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function DriverIntel() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("Loading live road intel...");

  useEffect(() => {
    fetch("/api/highways")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.alerts)) {
          setAlerts(data.alerts.slice(0, 3));
          setStatus(`Top 3 National Highways records · ${data.count} live`);
          return;
        }

        setStatus("No live road intel returned");
      })
      .catch((err) => {
        console.error("Driver intel error:", err);
        setStatus("Live road intel unavailable");
      });
  }, []);

  return (
    <details className="driver-intel-card driver-intel-collapsed" open={false}>
      <summary className="driver-section-title">
        <h3>Live Road Intel</h3>
        <span>{status}</span>
      </summary>

      <div className="driver-intel-list">
        {alerts.map((alert) => (
          <article className="driver-intel-item" key={alert.id}>
            <div className="driver-intel-road">🚧 {alert.road}</div>
            <p>{alert.detail}</p>
            <small>Ends: {formatDate(alert.endTime)}</small>
          </article>
        ))}
      </div>
    </details>
  );
}
