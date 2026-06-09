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

const trafficIcon = L.divIcon({
  className: "map-emoji-marker traffic-marker",
  html: "🚦",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
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


function trafficRatio(flow) {
  const current = Number(flow?.currentSpeed);
  const free = Number(flow?.freeFlowSpeed);
  if (!Number.isFinite(current) || !Number.isFinite(free) || free <= 0) return null;
  return current / free;
}

function trafficStatus(flow) {
  if (!flow) return { label: "WAITING", detail: "TomTom", color: "#64748b" };
  if (flow.roadClosure) return { label: "CLOSED", detail: "road closed", color: "#ef4444" };
  const ratio = trafficRatio(flow);
  if (ratio == null) return { label: "LIVE", detail: "TomTom", color: "#64748b" };
  if (ratio < 0.55) return { label: "HEAVY", detail: "slow traffic", color: "#ef4444" };
  if (ratio < 0.82) return { label: "SLOW", detail: "delays", color: "#f59e0b" };
  return { label: "CLEAR", detail: "free flow", color: "#20d86b" };
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
  routeOverride = null,
}) {
  const [highwaysAlerts, setHighwaysAlerts] = useState([]);
  const [tomTomTraffic, setTomTomTraffic] = useState([]);
  const [trafficFlow, setTrafficFlow] = useState(null);
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
    const routeLine = routeOverride?.geometry?.length ? routeOverride.geometry : plannedRoute?.geometry || [];
    const vehiclePoint = trackedVehicle?.lat && trackedVehicle?.lng ? [trackedVehicle.lat, trackedVehicle.lng] : null;

    let url = null;
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
        const sampleIndexes = [0, 0.2, 0.4, 0.6, 0.8, 1]
          .map((ratio) => Math.min(routeLine.length - 1, Math.max(0, Math.round((routeLine.length - 1) * ratio))));
        const flowPoints = sampleIndexes
          .map((index) => routeLine[index])
          .filter(Boolean)
          .map((point) => `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`)
          .join(';');
        const flowPart = vehiclePoint ? `&lat=${vehiclePoint[0]}&lng=${vehiclePoint[1]}` : '';
        const pointsPart = flowPoints ? `&points=${encodeURIComponent(flowPoints)}` : '';
        url = `/api/tomtom-traffic?bbox=${encodeURIComponent(bbox)}${flowPart}${pointsPart}`;
      }
    } else if (vehiclePoint) {
      url = `/api/tomtom-traffic?lat=${vehiclePoint[0]}&lng=${vehiclePoint[1]}&span=0.5`;
    }

    if (!url) return undefined;
    let cancelled = false;
    const loadTraffic = () => {
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setTomTomTraffic(Array.isArray(data.incidents) ? data.incidents : []);
            setTrafficFlow(data.flow || null);
          }
        })
        .catch((err) => console.error('TomTom traffic error:', err));
    };

    loadTraffic();
    const timer = window.setInterval(loadTraffic, navigationMode ? 60000 : 90000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [navigationMode, plannedRoute?.updatedAt, routeOverride?.updatedAt, trackedVehicle?.lat, trackedVehicle?.lng]);

  useEffect(() => {
    let cancelled = false;

    const loadTracking = () => {
      fetch(`/api/tracking?vehicle=${encodeURIComponent(fleetNo)}&_=${Date.now()}`, { cache: "no-store" })
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
      fetch(`/api/routes?vehicle=${encodeURIComponent(fleetNo)}&_=${Date.now()}`, { cache: "no-store" })
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

  const visibleRoute = routeOverride || plannedRoute;
  const liveVehicle = navigationMode ? trackedVehicle : (displayVehicle || trackedVehicle);
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
      : visibleRoute?.start
        ? [visibleRoute.start.lat, visibleRoute.start.lng]
        : [54.4863, -0.6133];

  const speed = mph(liveVehicle?.speedMps);
  const roadSpeed = trafficFlow?.currentSpeed != null ? Math.round(Number(trafficFlow.currentSpeed)) : null;
  const freeFlowSpeed = trafficFlow?.freeFlowSpeed != null ? Math.round(Number(trafficFlow.freeFlowSpeed)) : null;
  const trafficState = trafficStatus(trafficFlow);
  const rawRouteLine = visibleRoute?.geometry?.length > 1 ? visibleRoute.geometry : [];
  const trimIndex = navigationMode && liveVehicle ? Math.max(0, nearestRouteIndex(liveVehicle, rawRouteLine) - 2) : 0;
  const activeRouteLine = rawRouteLine.slice(trimIndex);
  const routeId = visibleRoute?.updatedAt || `${activeRouteLine.length}-${visibleRoute?.destination || "none"}`;
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

      {!navigationMode && <LerpVehicle target={trackedVehicle} setDisplayVehicle={setDisplayVehicle} />}

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
            pathOptions={{ color: trafficState.color, weight: 6, opacity: 1 }}
          />
        </>
      )}


      {!navigationMode && visibleRoute?.start && (
        <Marker position={[visibleRoute.start.lat, visibleRoute.start.lng]} icon={stopIcon}>
          <Popup><strong>Start</strong><br />{visibleRoute.start.label}</Popup>
        </Marker>
      )}

      {!navigationMode && visibleRoute?.waypoints?.map((stop, index) => (
        <Marker key={`${stop.label}-${index}`} position={[stop.lat, stop.lng]} icon={plannedStopIcon}>
          <Popup><strong>Stop {index + 1}</strong><br />{stop.label}</Popup>
        </Marker>
      ))}

      {!navigationMode && visibleRoute?.waypointPoint && !visibleRoute?.waypoints?.length && (
        <Marker position={[visibleRoute.waypointPoint.lat, visibleRoute.waypointPoint.lng]} icon={plannedStopIcon}>
          <Popup><strong>Stop</strong><br />{visibleRoute.waypoint}</Popup>
        </Marker>
      )}

      {visibleRoute?.end && (
        <Marker position={[visibleRoute.end.lat, visibleRoute.end.lng]} icon={plannedStopIcon}>
          <Popup><strong>Destination</strong><br />{visibleRoute.destination}</Popup>
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

      {tomTomTraffic.map((alert) => (
        <Marker key={`tomtom-${alert.id}`} position={[alert.lat, alert.lng]} icon={trafficIcon}>
          <Popup>
            <strong>{alert.road || 'Traffic'}</strong><br />
            {alert.detail || alert.title}<br />
            {alert.delaySeconds ? <><small>Delay: {Math.round(alert.delaySeconds / 60)} mins</small><br /></> : null}
            <small>TomTom live traffic</small>
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
      <div className="map-follow-badge">LIVE FOLLOW</div>
    )}
    {navigationMode && (
      <div className="map-traffic-speed-badge">
        <span>TRAFFIC</span>
        <strong>{trafficState.label}</strong>
        <small>{roadSpeed != null ? `flow ${roadSpeed} mph` : trafficState.detail}</small>
        {freeFlowSpeed != null && <small>free flow {freeFlowSpeed}</small>}
      </div>
    )}
    </div>
  );
}
