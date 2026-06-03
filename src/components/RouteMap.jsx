import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const stopIcon = L.divIcon({
  className: "map-emoji-marker stop-marker",
  html: "🚌",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const closureIcon = L.divIcon({
  className: "map-emoji-marker closure-marker",
  html: "🚧",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const route = [
  {
    name: "Start",
    label: "York",
    position: [53.959, -1.081],
  },
  {
    name: "Service Stop",
    label: "Peterborough Services",
    position: [52.574, -0.242],
  },
  {
    name: "Destination",
    label: "London Victoria",
    position: [51.507, -0.128],
  },
];

const routeLine = route.map((stop) => stop.position);

const liveCoachTrack = [
  [53.959, -1.081],
  [53.705, -1.115],
  [53.52, -1.10],
  [53.23, -0.98],
  [52.92, -0.73],
  [52.574, -0.242],
  [52.28, -0.13],
  [51.96, -0.12],
  [51.72, -0.14],
  [51.507, -0.128],
];

export default function RouteMap({
  height = "700px",
  fleetNo = "EV101",
  reg = "YX72 AEE",
  liveTracking = true,
}) {
  const [highwaysAlerts, setHighwaysAlerts] = useState([]);
  const [coachStep, setCoachStep] = useState(0);

  const coachIcon = useMemo(
    () =>
      L.divIcon({
        className: "coach-live-marker",
        html: `<div class="coach-live-label"><span>🚌</span><strong>${fleetNo}</strong></div>`,
        iconSize: [92, 36],
        iconAnchor: [46, 18],
      }),
    [fleetNo],
  );

  useEffect(() => {
    fetch("/api/highways")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.alerts)) {
          setHighwaysAlerts(
            data.alerts.filter((alert) => alert.lat && alert.lng),
          );
        }
      })
      .catch((err) => console.error("Map highways error:", err));
  }, []);

  useEffect(() => {
    if (!liveTracking) return undefined;

    const timer = window.setInterval(() => {
      setCoachStep((current) => (current + 1) % liveCoachTrack.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [liveTracking]);

  const coachPosition = liveCoachTrack[coachStep];

  return (
    <MapContainer
      center={[52.6, -0.6]}
      zoom={7}
      style={{ height, width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Polyline
        positions={routeLine}
        pathOptions={{
          color: "#ffffff",
          weight: 10,
          opacity: 0.95,
        }}
      />

      <Polyline
        positions={routeLine}
        pathOptions={{
          color: "#1268ff",
          weight: 6,
          opacity: 1,
        }}
      />

      {route.map((stop) => (
        <Marker key={stop.name} position={stop.position} icon={stopIcon}>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.label}
          </Popup>
        </Marker>
      ))}

      <Marker position={coachPosition} icon={coachIcon}>
        <Popup>
          <strong>{fleetNo}</strong>
          <br />
          Reg: {reg}
          <br />
          Simulated live tracking
        </Popup>
      </Marker>

      {highwaysAlerts.map((alert) => (
        <Marker
          key={`highways-${alert.id}`}
          position={[alert.lat, alert.lng]}
          icon={closureIcon}
        >
          <Popup>
            <strong>{alert.road}</strong>
            <br />
            {alert.detail}
            <br />
            <small>{alert.source}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
