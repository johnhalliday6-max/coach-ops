import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
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

const plannedStopIcon = L.divIcon({
  className: "map-emoji-marker planned-stop-marker",
  html: "📍",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function FitMapToRoute({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!positions || positions.length < 2) return;
    map.fitBounds(positions, { padding: [35, 35] });
  }, [map, positions]);

  return null;
}

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

function mph(speedMps) {
  if (speedMps == null || Number.isNaN(Number(speedMps))) return null;
  return Math.round(Number(speedMps) * 2.23694);
}

export default function RouteMap({
  height = "700px",
  fleetNo = "23031",
  reg = "YJ72 CGG",
  liveTracking = true,
}) {
  const [highwaysAlerts, setHighwaysAlerts] = useState([]);
  const [coachStep, setCoachStep] = useState(0);
  const [trackedVehicle, setTrackedVehicle] = useState(null);
  const [plannedRoute, setPlannedRoute] = useState(null);

  const coachIcon = useMemo(
    () =>
      L.divIcon({
        className: "coach-live-marker",
        html: `<div class="coach-live-label"><span>🚌</span><strong>${fleetNo}</strong></div>`,
        iconSize: [110, 36],
        iconAnchor: [55, 18],
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

  useEffect(() => {
    let cancelled = false;

    const loadTracking = () => {
      fetch(`/api/tracking?vehicle=${encodeURIComponent(fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setTrackedVehicle(data.vehicle || null);
          }
        })
        .catch((err) => console.error("Tracking fetch error:", err));
    };

    loadTracking();
    const timer = window.setInterval(loadTracking, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fleetNo]);

  const coachPosition =
    trackedVehicle?.lat && trackedVehicle?.lng
      ? [trackedVehicle.lat, trackedVehicle.lng]
      : liveCoachTrack[coachStep];


  useEffect(() => {
    let cancelled = false;

    const loadRoute = () => {
      fetch(`/api/routes?vehicle=${encodeURIComponent(fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setPlannedRoute(data.route || null);
          }
        })
        .catch((err) => console.error("Route fetch error:", err));
    };

    loadRoute();
    const timer = window.setInterval(loadRoute, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fleetNo]);

  const speed = mph(trackedVehicle?.speedMps);
  const activeRouteLine = plannedRoute?.geometry?.length > 1 ? plannedRoute.geometry : routeLine;
  const plannedStops = Array.isArray(plannedRoute?.stopPoints) ? plannedRoute.stopPoints : [];

  return (
    <MapContainer
      center={coachPosition || [52.6, -0.6]}
      zoom={7}
      style={{ height, width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitMapToRoute positions={activeRouteLine} />

      <Polyline
        positions={activeRouteLine}
        pathOptions={{
          color: "#ffffff",
          weight: 10,
          opacity: 0.95,
        }}
      />

      <Polyline
        positions={activeRouteLine}
        pathOptions={{
          color: plannedRoute ? "#20d86b" : "#1268ff",
          weight: 6,
          opacity: 1,
        }}
      />

      {!plannedRoute && route.map((stop) => (
        <Marker key={stop.name} position={stop.position} icon={stopIcon}>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.label}
          </Popup>
        </Marker>
      ))}

      {plannedRoute?.start && (
        <Marker position={[plannedRoute.start.lat, plannedRoute.start.lng]} icon={stopIcon}>
          <Popup><strong>Start</strong><br />{plannedRoute.start.label}</Popup>
        </Marker>
      )}

      {plannedStops.length > 0 && plannedStops.map((stop, index) => (
        <Marker
          key={`planned-stop-${index}`}
          position={[stop.lat, stop.lng]}
          icon={plannedStopIcon}
        >
          <Popup>
            <strong>Stop {index + 1}</strong>
            <br />
            {plannedRoute.stops?.[index] || stop.label}
          </Popup>
        </Marker>
      ))}

      {plannedRoute?.end && (
        <Marker position={[plannedRoute.end.lat, plannedRoute.end.lng]} icon={plannedStopIcon}>
          <Popup><strong>Destination</strong><br />{plannedRoute.destination}</Popup>
        </Marker>
      )}

      <Marker position={coachPosition} icon={coachIcon}>
        <Popup>
          <strong>{fleetNo}</strong>
          <br />
          Reg: {trackedVehicle?.reg || reg}
          <br />
          {trackedVehicle ? "Live phone GPS" : "Simulated live tracking"}
          {speed != null && (
            <>
              <br />
              Speed: {speed} mph
            </>
          )}
          {trackedVehicle?.accuracy && (
            <>
              <br />
              Accuracy: ±{Math.round(trackedVehicle.accuracy)}m
            </>
          )}
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
