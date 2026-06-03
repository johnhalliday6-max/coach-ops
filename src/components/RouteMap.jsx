import { useEffect, useMemo, useRef, useState } from "react";
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

function FitMapToRoute({ routeId, positions, enabled }) {
  const map = useMap();
  const lastRouteId = useRef(null);

  useEffect(() => {
    if (!enabled || !positions || positions.length < 2) return;
    if (lastRouteId.current === routeId) return;
    lastRouteId.current = routeId;
    map.fitBounds(positions, { padding: [35, 35] });
  }, [enabled, map, positions, routeId]);

  return null;
}

function FollowCoach({ position, enabled, zoom = 16 }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !position) return;
    map.setView(position, Math.max(map.getZoom(), zoom), { animate: true });
  }, [enabled, map, position, zoom]);

  return null;
}

function mph(speedMps) {
  if (speedMps == null || Number.isNaN(Number(speedMps))) return null;
  return Math.max(0, Math.round(Number(speedMps) * 2.23694));
}

export default function RouteMap({
  height = "700px",
  fleetNo = "23031",
  reg = "YJ72 CGG",
  liveTracking = false,
  followCoach = false,
  navigationMode = false,
  showDefaultRoute = false,
  fitRoute = true,
}) {
  const [highwaysAlerts, setHighwaysAlerts] = useState([]);
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
          setHighwaysAlerts(data.alerts.filter((alert) => alert.lat && alert.lng));
        }
      })
      .catch((err) => console.error("Map highways error:", err));
  }, []);

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
    const timer = window.setInterval(loadTracking, liveTracking ? 2500 : 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fleetNo, liveTracking]);

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

  const coachPosition =
    trackedVehicle?.lat && trackedVehicle?.lng
      ? [trackedVehicle.lat, trackedVehicle.lng]
      : plannedRoute?.start
        ? [plannedRoute.start.lat, plannedRoute.start.lng]
        : [54.4863, -0.6133];

  const speed = mph(trackedVehicle?.speedMps);
  const activeRouteLine = plannedRoute?.geometry?.length > 1 ? plannedRoute.geometry : [];
  const routeId = plannedRoute?.updatedAt || `${activeRouteLine.length}-${plannedRoute?.destination || "none"}`;
  const shouldShowRoute = activeRouteLine.length > 1;
  void showDefaultRoute;
  const center = navigationMode || followCoach ? coachPosition : coachPosition || [52.6, -0.6];

  return (
    <MapContainer
      center={center}
      zoom={navigationMode || followCoach ? 15 : 7}
      style={{ height, width: "100%" }}
      zoomControl={!navigationMode}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitMapToRoute
        positions={activeRouteLine}
        routeId={routeId}
        enabled={fitRoute && !followCoach && !navigationMode}
      />
      <FollowCoach position={coachPosition} enabled={followCoach || navigationMode} zoom={navigationMode ? 16 : 15} />

      {shouldShowRoute && (
        <>
          <Polyline
            positions={activeRouteLine}
            pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.95 }}
          />
          <Polyline
            positions={activeRouteLine}
            pathOptions={{ color: "#20d86b", weight: 6, opacity: 1 }}
          />
        </>
      )}


      {plannedRoute?.start && (
        <Marker position={[plannedRoute.start.lat, plannedRoute.start.lng]} icon={stopIcon}>
          <Popup><strong>Start</strong><br />{plannedRoute.start.label}</Popup>
        </Marker>
      )}

      {plannedRoute?.waypoints?.map((stop, index) => (
        <Marker key={`${stop.label}-${index}`} position={[stop.lat, stop.lng]} icon={plannedStopIcon}>
          <Popup><strong>Stop {index + 1}</strong><br />{stop.label}</Popup>
        </Marker>
      ))}

      {plannedRoute?.waypointPoint && !plannedRoute?.waypoints?.length && (
        <Marker position={[plannedRoute.waypointPoint.lat, plannedRoute.waypointPoint.lng]} icon={plannedStopIcon}>
          <Popup><strong>Stop</strong><br />{plannedRoute.waypoint}</Popup>
        </Marker>
      )}

      {plannedRoute?.end && (
        <Marker position={[plannedRoute.end.lat, plannedRoute.end.lng]} icon={plannedStopIcon}>
          <Popup><strong>Destination</strong><br />{plannedRoute.destination}</Popup>
        </Marker>
      )}

      <Marker position={coachPosition} icon={coachIcon}>
        <Popup>
          <strong>{fleetNo}</strong><br />
          Reg: {trackedVehicle?.reg || reg}<br />
          {trackedVehicle ? "Live phone GPS" : "Waiting for live GPS"}
          {speed != null && (<><br />Current speed: {speed} mph</>)}
          {trackedVehicle?.accuracy && (<><br />Accuracy: ±{Math.round(trackedVehicle.accuracy)}m</>)}
        </Popup>
      </Marker>

      {highwaysAlerts.map((alert) => (
        <Marker key={`highways-${alert.id}`} position={[alert.lat, alert.lng]} icon={closureIcon}>
          <Popup>
            <strong>{alert.road}</strong><br />
            {alert.detail}<br />
            <small>{alert.source}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
