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

function FollowCoach({ position, enabled, autoFollow, zoom = 17, navigationMode = false }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !autoFollow || !position) return;

    const currentZoom = map.getZoom();
    const targetZoom = navigationMode ? Math.max(currentZoom, zoom) : Math.max(currentZoom, zoom);

    if (navigationMode) {
      const size = map.getSize();
      const projected = map.project(position, targetZoom);
      // Keep the coach lower on screen so the road ahead takes most of the display.
      const offsetProjected = projected.subtract([0, size.y * 0.28]);
      const offsetLatLng = map.unproject(offsetProjected, targetZoom);
      map.setView(offsetLatLng, targetZoom, { animate: true, duration: 0.45 });
      return;
    }

    map.setView(position, targetZoom, { animate: true, duration: 0.45 });
  }, [enabled, autoFollow, map, position, zoom, navigationMode]);

  return null;
}

function ManualMapWatcher({ enabled, onManualMove }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return undefined;
    const markManual = () => onManualMove?.();
    map.on("dragstart", markManual);
    map.on("zoomstart", markManual);
    map.on("mousedown", markManual);
    map.on("touchstart", markManual);
    map.on("wheel", markManual);
    return () => {
      map.off("dragstart", markManual);
      map.off("zoomstart", markManual);
      map.off("mousedown", markManual);
      map.off("touchstart", markManual);
      map.off("wheel", markManual);
    };
  }, [enabled, map, onManualMove]);

  return null;
}

function mph(speedMps) {
  if (speedMps == null || Number.isNaN(Number(speedMps))) return null;
  return Math.max(0, Math.round(Number(speedMps) * 2.23694));
}


function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat ?? a[0]);
  const lng1 = Number(a.lng ?? a[1]);
  const lat2 = Number(b.lat ?? b[0]);
  const lng2 = Number(b.lng ?? b[1]);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearestRouteIndex(position, geometry) {
  if (!position || !Array.isArray(geometry) || geometry.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Infinity;
  geometry.forEach((point, index) => {
    const distance = metresBetween(position, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function LerpVehicle({ target, setDisplayVehicle }) {
  const previous = useRef(null);

  useEffect(() => {
    if (!target?.lat || !target?.lng) return undefined;

    const from = previous.current || target;
    const to = target;
    previous.current = target;
    const start = performance.now();
    const duration = 1200;
    let frame;

    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t * (2 - t);
      setDisplayVehicle({
        ...to,
        lat: Number(from.lat) + (Number(to.lat) - Number(from.lat)) * eased,
        lng: Number(from.lng) + (Number(to.lng) - Number(from.lng)) * eased,
      });
      if (t < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, setDisplayVehicle]);

  return null;
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
  const [displayVehicle, setDisplayVehicle] = useState(null);
  const [plannedRoute, setPlannedRoute] = useState(null);
  const [autoFollow, setAutoFollow] = useState(true);

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

  useEffect(() => {
    if (navigationMode) setAutoFollow(true);
  }, [navigationMode, plannedRoute?.updatedAt]);

  const liveVehicle = displayVehicle || trackedVehicle;
  const heading = Number(liveVehicle?.heading || 0);
  const coachIcon = useMemo(
    () =>
      L.divIcon({
        className: "coach-live-marker",
        html: `<div class="coach-live-dot"><span style="transform: rotate(${Number.isFinite(heading) ? heading : 0}deg)">▲</span><small>${fleetNo}</small></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    [fleetNo, heading],
  );
  const coachPosition =
    liveVehicle?.lat && liveVehicle?.lng
      ? [liveVehicle.lat, liveVehicle.lng]
      : plannedRoute?.start
        ? [plannedRoute.start.lat, plannedRoute.start.lng]
        : [54.4863, -0.6133];

  const speed = mph(liveVehicle?.speedMps);
  const rawRouteLine = plannedRoute?.geometry?.length > 1 ? plannedRoute.geometry : [];
  const trimIndex = navigationMode && liveVehicle ? Math.max(0, nearestRouteIndex(liveVehicle, rawRouteLine) - 2) : 0;
  const activeRouteLine = rawRouteLine.slice(trimIndex);
  const routeId = plannedRoute?.updatedAt || `${activeRouteLine.length}-${plannedRoute?.destination || "none"}`;
  const shouldShowRoute = activeRouteLine.length > 1;
  void showDefaultRoute;
  const center = navigationMode || followCoach ? coachPosition : coachPosition || [52.6, -0.6];

  return (
    <div className={navigationMode ? "route-map-shell navigation" : "route-map-shell"} style={{ height, width: "100%" }}>
    <MapContainer
      className={navigationMode ? "driver-satnav-map" : ""}
      center={center}
      zoom={navigationMode || followCoach ? 16 : 7}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <LerpVehicle target={trackedVehicle} setDisplayVehicle={setDisplayVehicle} />

      <FitMapToRoute
        positions={activeRouteLine}
        routeId={routeId}
        enabled={fitRoute && !followCoach && !navigationMode}
      />
      <ManualMapWatcher enabled={navigationMode} onManualMove={() => setAutoFollow(false)} />
      <FollowCoach
        position={coachPosition}
        enabled={followCoach || navigationMode}
        autoFollow={autoFollow}
        zoom={navigationMode ? 17 : 15}
        navigationMode={navigationMode}
      />

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


      {!navigationMode && plannedRoute?.start && (
        <Marker position={[plannedRoute.start.lat, plannedRoute.start.lng]} icon={stopIcon}>
          <Popup><strong>Start</strong><br />{plannedRoute.start.label}</Popup>
        </Marker>
      )}

      {!navigationMode && plannedRoute?.waypoints?.map((stop, index) => (
        <Marker key={`${stop.label}-${index}`} position={[stop.lat, stop.lng]} icon={plannedStopIcon}>
          <Popup><strong>Stop {index + 1}</strong><br />{stop.label}</Popup>
        </Marker>
      ))}

      {!navigationMode && plannedRoute?.waypointPoint && !plannedRoute?.waypoints?.length && (
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
          Reg: {liveVehicle?.reg || reg}<br />
          {liveVehicle ? "Live phone GPS" : "Waiting for live GPS"}
          {speed != null && (<><br />Current speed: {speed} mph</>)}
          {liveVehicle?.accuracy && (<><br />Accuracy: ±{Math.round(liveVehicle.accuracy)}m</>)}
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
    {navigationMode && !autoFollow && (
      <button className="map-recenter-button" type="button" onClick={() => setAutoFollow(true)}>
        ⦿ Re-centre
      </button>
    )}
    {navigationMode && autoFollow && (
      <div className="map-follow-badge">FOLLOW</div>
    )}
    </div>
  );
}
