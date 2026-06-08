import { useEffect, useMemo, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";
import { fleetData } from "../data/fleetData";
import PlaceSearchBox from "./PlaceSearchBox";

const DRIVER_TEST_PROFILES = {
  "1600026": {
    employeeId: "1600026",
    name: "John Halliday",
    preferredFleetNo: "23031",
  },
  "06032013": {
    employeeId: "06032013",
    name: "Anna Bonnard-Halliday",
    preferredFleetNo: "23030",
  },
};


function readDriverSession() {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(window.localStorage.getItem('coachOpsDriverSession') || 'null');
    return session && session.employeeId ? session : null;
  } catch {
    return null;
  }
}

function writeDriverSession(profile, vehicle) {
  if (typeof window === 'undefined' || !profile || !vehicle) return;
  window.localStorage.setItem('coachOpsDriverSession', JSON.stringify({
    employeeId: profile.employeeId,
    fleetNo: vehicle.fleetNo,
    savedAt: new Date().toISOString(),
  }));
}

function getManagedFleet() {
  try {
    const stored = JSON.parse(window.localStorage.getItem("coachOpsManagedFleet") || "null");
    return Array.isArray(stored) && stored.length ? stored : fleetData;
  } catch {
    return fleetData;
  }
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

function distanceToRouteMetres(position, geometry) {
  if (!position || !Array.isArray(geometry) || geometry.length === 0) return Infinity;
  let best = Infinity;
  for (const point of geometry) {
    const d = metresBetween(position, point);
    if (d < best) best = d;
  }
  return best;
}

function nearestRouteGeometryIndex(position, geometry) {
  if (!position || !Array.isArray(geometry) || geometry.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Infinity;
  geometry.forEach((point, index) => {
    const d = metresBetween(position, point);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function instructionIndexFromRouteProgress(position, route) {
  const instructions = route?.instructions || [];
  const geometry = route?.geometry || [];
  if (!position || instructions.length === 0 || geometry.length === 0) return 0;
  const shapeIndex = nearestRouteGeometryIndex(position, geometry);
  const next = instructions.findIndex((step) => Number(step.endShapeIndex ?? step.beginShapeIndex ?? 0) >= shapeIndex + 3);
  if (next >= 0) return next;
  return Math.max(0, instructions.length - 1);
}

function nearestInstructionIndex(position, instructions) {
  if (!position || !Array.isArray(instructions) || instructions.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Infinity;
  instructions.forEach((step, index) => {
    if (!step.location) return;
    const d = metresBetween(position, step.location);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });

  // When very close to the current instruction, advance to the next useful one.
  if (bestDistance < 45 && bestIndex < instructions.length - 1) return bestIndex + 1;
  return bestIndex;
}

function formatMetres(metres) {
  if (!Number.isFinite(metres)) return '--';
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} yd`;
  return `${Math.round((metres / 1609.344) * 10) / 10} mi`;
}

function etaFromMinutes(minutes) {
  const value = Number(minutes || 0);
  if (!value) return '--:--';
  const date = new Date(Date.now() + value * 60 * 1000);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function currentMph(speedMps) {
  if (speedMps == null || Number.isNaN(Number(speedMps))) return "--";
  return Math.max(0, Math.round(Number(speedMps) * 2.23694));
}

function formatDistance(step) {
  if (!step) return "--";
  const metres = Number(step.distanceMetres || 0);
  if (metres && metres < 1609) return `${Math.max(10, Math.round(metres / 10) * 10)} yd`;
  return `${step.distanceMiles || "--"} mi`;
}

export default function DriverView({ selectedFleet }) {
  // Never default every driver session to the CGG test coach.
  // The selected/phone vehicle must be the source of truth so 200+ coaches
  // can each have their own tracking, route push and active route.
  const availableFleetAtStart = getManagedFleet();
  const savedSession = readDriverSession();
  const savedProfile = savedSession?.employeeId ? DRIVER_TEST_PROFILES[savedSession.employeeId] : null;
  const savedVehicle = savedSession?.fleetNo
    ? availableFleetAtStart.find((item) => item.fleetNo === savedSession.fleetNo)
    : null;
  const defaultVehicle = savedVehicle || selectedFleet || availableFleetAtStart[0] || fleetData[0];

  const [vehicle, setVehicle] = useState(defaultVehicle);
  const [vehicleSelected, setVehicleSelected] = useState(Boolean(savedProfile));
  const [driverProfile, setDriverProfile] = useState(savedProfile || null);
  const [selectedCompany, setSelectedCompany] = useState("Esk Valley Coaches");
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [passengers, setPassengers] = useState(34);
  const [message, setMessage] = useState("");
  const [lastAction, setLastAction] = useState("Select vehicle to begin");
  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [lastPosition, setLastPosition] = useState(null);
  const [destination, setDestination] = useState("");
  const [stopInput, setStopInput] = useState("");
  const [stops, setStops] = useState([]);
  const [routeStatus, setRouteStatus] = useState("Select vehicle to start live GPS");
  const [routeSummary, setRouteSummary] = useState(null);
  const [officeRequests, setOfficeRequests] = useState([]);
  const [pendingRoutePush, setPendingRoutePush] = useState(null);
  const [navMode, setNavMode] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [trafficFlow, setTrafficFlow] = useState(null);
  const selectedVehicleRef = useRef(defaultVehicle.fleetNo);
  const currentVehicleRef = useRef(defaultVehicle);
  const watchId = useRef(null);
  const rerouteLock = useRef(false);
  const wakeLockRef = useRef(null);

  const nextStep = useMemo(
    () => routeSummary?.instructions?.[activeStepIndex] || routeSummary?.instructions?.[0] || null,
    [routeSummary, activeStepIndex],
  );
  const followingSteps = useMemo(
    () => (routeSummary?.instructions || []).slice(activeStepIndex + 1, activeStepIndex + 6),
    [routeSummary, activeStepIndex],
  );
  const nextStepDistance = useMemo(() => {
    if (!lastPosition || !nextStep?.location) return null;
    return metresBetween(lastPosition, nextStep.location);
  }, [lastPosition, nextStep]);

  const availableFleet = useMemo(() => getManagedFleet(), []);
  const companies = useMemo(() => [...new Set(availableFleet.map((item) => item.category || item.operator))], [availableFleet]);
  const companyVehicles = useMemo(
    () => availableFleet.filter((item) => (item.category || item.operator) === selectedCompany),
    [availableFleet, selectedCompany],
  );

  useEffect(() => {
    currentVehicleRef.current = vehicle;
    selectedVehicleRef.current = vehicle?.fleetNo;
  }, [vehicle]);

  const remainingNav = useMemo(() => {
    const steps = (routeSummary?.instructions || []).slice(activeStepIndex);
    if (!steps.length) {
      return {
        miles: routeSummary?.distanceMiles || null,
        minutes: routeSummary?.durationMinutes || null,
      };
    }
    const metres = steps.reduce((sum, step) => sum + Number(step.distanceMetres || 0), 0);
    const minutes = steps.reduce((sum, step) => sum + Number(step.durationMinutes || 0), 0);
    return {
      miles: Math.round((metres / 1609.344) * 10) / 10,
      minutes: Math.max(1, Math.round(minutes)),
    };
  }, [routeSummary, activeStepIndex]);

  const postOfficeRequest = async (type, text, source = "driver") => {
    try {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: vehicle.fleetNo,
          reg: vehicle.reg,
          operator: vehicle.operator,
          category: vehicle.category || vehicle.operator,
          company: vehicle.category || vehicle.operator,
          depot: vehicle.depot,
          type,
          message: text,
          source,
        }),
      });
    } catch (error) {
      console.error("Office request failed", error);
    }
  };

  const clearLocalRouteState = () => {
    // Local screen reset only. Do not delete server routes during normal planning;
    // that caused multi-coach tests to look like routes were cancelling each other.
    setRouteSummary(null);
    setPendingRoutePush(null);
    setActiveStepIndex(0);
    setOffRoute(false);
  };

  const loginDriver = () => {
    const employeeId = employeeIdInput.trim();
    const profile = DRIVER_TEST_PROFILES[employeeId];

    if (!profile) {
      setLoginError("Employee number not recognised in this test build");
      return;
    }

    const assignedVehicle = availableFleet.find((item) => item.fleetNo === profile.preferredFleetNo) || vehicle || availableFleet[0] || fleetData[0];
    setDriverProfile(profile);
    setVehicle(assignedVehicle);
    writeDriverSession(profile, assignedVehicle);
    selectedVehicleRef.current = assignedVehicle.fleetNo;
    currentVehicleRef.current = assignedVehicle;
    setVehicleSelected(true);
    setLoginError("");
    clearLocalRouteState();
    setNavMode(false);
    setDestination("");
    setStops([]);
    setRouteStatus(`Logged in. Vehicle ${assignedVehicle.fleetNo} assigned.`);
    setLastAction(`Driver logged in · ${assignedVehicle.fleetNo} / ${assignedVehicle.reg}`);
    window.setTimeout(startTracking, 0);
  };

  const switchVehicle = (item) => {
    setVehicle(item);
    writeDriverSession(driverProfile, item);
    selectedVehicleRef.current = item.fleetNo;
    currentVehicleRef.current = item;
    clearLocalRouteState();
    setNavMode(false);
    setDestination("");
    setStops([]);
    setRouteStatus(`Selected ${item.fleetNo} / ${item.reg}`);
    setLastAction(`Vehicle changed to ${item.fleetNo} / ${item.reg}`);

    // Immediately republish the last GPS fix under the new selected coach.
    // Otherwise the office keeps seeing the phone under the old coach until
    // the browser receives another geolocation update.
    if (lastPosition?.lat && lastPosition?.lng) {
      postLocation({
        coords: {
          latitude: lastPosition.lat,
          longitude: lastPosition.lng,
          accuracy: lastPosition.accuracy,
          speed: lastPosition.speedMps,
          heading: lastPosition.heading,
        },
      });
    }
  };

  const notify = (text, type = "INFO") => {
    setLastAction(text);
    postOfficeRequest(type, text);
  };

  const postLocation = async (position) => {
    const coords = position.coords;
    const activeVehicle = currentVehicleRef.current || vehicle;

    const payload = {
      fleetNo: activeVehicle.fleetNo,
      reg: activeVehicle.reg,
      operator: activeVehicle.operator,
      depot: activeVehicle.depot,
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      speedMps: coords.speed,
      heading: coords.heading,
    };

    if (payload.accuracy && payload.accuracy > 80) {
      setLastAction(`GPS accuracy poor: ±${Math.round(payload.accuracy)}m`);
      return;
    }

    setLastPosition({ ...payload, updatedAt: new Date().toISOString() });

    try {
      await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setLastAction(`Tracking live for ${activeVehicle.fleetNo} / ${activeVehicle.reg}`);
    } catch (error) {
      console.error(error);
      setTrackingError("Could not send GPS to office");
    }
  };

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch (error) {
      console.warn("Wake lock unavailable", error);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setTrackingError("This phone/browser does not support GPS tracking");
      return;
    }

    if (watchId.current != null) return;

    requestWakeLock();
    setTrackingError("");
    setTracking(true);
    setLastAction("Requesting phone GPS permission...");

    watchId.current = navigator.geolocation.watchPosition(
      postLocation,
      (error) => {
        setTracking(false);
        setTrackingError(error.message || "Location permission denied");
        setLastAction("GPS tracking failed");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  };

  const addStop = () => {
    const text = stopInput.trim();
    if (!text) return;
    setStops((current) => [...current, text]);
    setStopInput("");
  };

  const planRoute = async () => {
    if (!lastPosition?.lat || !lastPosition?.lng) {
      setRouteStatus("Waiting for GPS fix before building route");
      return;
    }

    if (!destination.trim()) {
      setRouteStatus("Enter a destination first");
      return;
    }

    setRouteStatus("Building route from your live GPS...");
    clearLocalRouteState();

    try {
      const routeResponse = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: lastPosition.lat,
          startLng: lastPosition.lng,
          destination,
          stops,
        }),
      });

      const routeData = await routeResponse.json();

      if (!routeData?.ok) {
        setRouteStatus(routeData?.error || "Route build failed");
        return;
      }

      const route = routeData.route;

      const activeRoutePayload = {
        ...route,
        fleetNo: vehicle.fleetNo,
        reg: vehicle.reg,
        destination,
        waypoint: stops.join(" → "),
        stops,
        updatedAt: new Date().toISOString(),
        source: "driver",
      };

      const saveResponse = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeRoutePayload),
      });
      const saveData = await saveResponse.json().catch(() => null);
      if (!saveResponse.ok || !saveData?.ok) {
        throw new Error(saveData?.error || "Could not sync route to office");
      }

      setPendingRoutePush(null);
      setRouteSummary(saveData.route || activeRoutePayload);
      setActiveStepIndex(0);
      setRouteStatus(`Route live: ${route.distanceMiles} miles · approx ${route.durationMinutes} mins`);
      setLastAction(`Navigation mode active for ${vehicle.fleetNo}`);
      setNavMode(true);
      requestWakeLock();
      await postOfficeRequest(
        "ROUTE_SET",
        `Driver set route to ${destination}${stops.length ? ` via ${stops.join(" → ")}` : ""}`,
      );
    } catch (error) {
      console.error(error);
      setRouteStatus("Route planner failed");
    }
  };



  const applyRouteToDriver = async (route, sourceText = "Route loaded") => {
    if (!route) return;
    const routeForVehicle = {
      ...route,
      fleetNo: vehicle.fleetNo,
      reg: vehicle.reg,
      operator: vehicle.operator,
      depot: vehicle.depot,
      updatedAt: new Date().toISOString(),
    };

    await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(routeForVehicle),
    });
    setDestination(routeForVehicle.destination || destination);
    setStops(Array.isArray(routeForVehicle.stops) ? routeForVehicle.stops : []);
    setRouteSummary(routeForVehicle);
    setRouteStatus(`Route live: ${route.distanceMiles} miles · approx ${route.durationMinutes} mins`);
    setLastAction(sourceText);
    setNavMode(true);
    requestWakeLock();
  };

  const acceptRoutePush = async () => {
    if (!pendingRoutePush?.route) return;
    await applyRouteToDriver(pendingRoutePush.route, "Office route accepted");
    await fetch("/api/route-pushes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pendingRoutePush.id, accepted: true }),
    });
    await postOfficeRequest("ROUTE_ACCEPTED", `Driver accepted office route to ${pendingRoutePush.route.destination}`);
    setPendingRoutePush(null);
  };

  const declineRoutePush = async () => {
    if (!pendingRoutePush) return;
    await fetch("/api/route-pushes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pendingRoutePush.id, accepted: true }),
    });
    await postOfficeRequest("ROUTE_DECLINED", "Driver declined office route update");
    setPendingRoutePush(null);
  };

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (wakeLockRef.current) wakeLockRef.current.release?.();
    };
  }, []);

  useEffect(() => {
    if (!lastPosition?.lat || !lastPosition?.lng) return undefined;
    let cancelled = false;

    const loadFlow = () => {
      const routeLine = Array.isArray(routeSummary?.geometry) ? routeSummary.geometry : [];
      const sampleIndexes = routeLine.length > 1
        ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.min(routeLine.length - 1, Math.max(0, Math.round((routeLine.length - 1) * ratio))))
        : [];
      const flowPoints = sampleIndexes
        .map((index) => routeLine[index])
        .filter(Boolean)
        .map((point) => `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`)
        .join(';');
      const pointsPart = flowPoints ? `&points=${encodeURIComponent(flowPoints)}` : '';
      fetch(`/api/tomtom-traffic?lat=${lastPosition.lat}&lng=${lastPosition.lng}&span=0.25${pointsPart}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) setTrafficFlow(data.flow || null);
        })
        .catch((err) => console.error('Driver TomTom flow failed', err));
    };

    loadFlow();
    const timer = window.setInterval(loadFlow, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lastPosition?.lat, lastPosition?.lng, routeSummary?.updatedAt]);

  useEffect(() => {
    if (!lastPosition || !routeSummary) return;

    const currentPoint = { lat: lastPosition.lat, lng: lastPosition.lng };
    const nextIndex = instructionIndexFromRouteProgress(currentPoint, routeSummary);
    setActiveStepIndex((current) => Math.max(current, nextIndex));

    const routeDistance = distanceToRouteMetres(currentPoint, routeSummary.geometry || []);
    const isOffRoute = routeDistance > 150;
    setOffRoute(isOffRoute);

    if (isOffRoute && !rerouteLock.current && destination.trim()) {
      rerouteLock.current = true;
      setRouteStatus('Off route - recalculating...');
      window.setTimeout(() => {
        planRoute().finally(() => {
          window.setTimeout(() => {
            rerouteLock.current = false;
          }, 30000);
        });
      }, 500);
    }
  }, [lastPosition, routeSummary, destination]);


  useEffect(() => {
    if (!vehicleSelected) return undefined;
    let cancelled = false;

    const loadActiveRoute = () => {
      fetch(`/api/routes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data?.ok || !data.route) return;

          const incomingRoute = data.route;
          const incomingStamp = String(incomingRoute.updatedAt || '');
          const currentStamp = String(routeSummary?.updatedAt || '');
          const routeChanged = !routeSummary || incomingStamp !== currentStamp || incomingRoute.destination !== routeSummary.destination;

          if (routeChanged) {
            setRouteSummary(incomingRoute);
            setDestination(incomingRoute.destination || '');
            setStops(Array.isArray(incomingRoute.stops) ? incomingRoute.stops : []);
            setActiveStepIndex(0);
            setRouteStatus(`Assigned route loaded: ${incomingRoute.destination || 'route'}`);
            setLastAction(`Route updated for ${vehicle.fleetNo}`);
          }
        })
        .catch((err) => console.error('Driver active route fetch failed', err));
    };

    loadActiveRoute();
    const timer = window.setInterval(loadActiveRoute, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vehicleSelected, vehicle.fleetNo, routeSummary]);

  useEffect(() => {
    if (!vehicleSelected) return undefined;
    let cancelled = false;

    const loadRoutePush = () => {
      fetch(`/api/route-pushes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setPendingRoutePush(data.push || null);
          }
        })
        .catch((err) => console.error("Driver route push fetch failed", err));
    };

    loadRoutePush();
    const timer = window.setInterval(loadRoutePush, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vehicleSelected, vehicle.fleetNo]);

  useEffect(() => {
    if (!vehicleSelected) return undefined;
    let cancelled = false;

    const loadRequests = () => {
      fetch(`/api/requests?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            const requests = data.requests || [];
            setOfficeRequests(requests.slice(0, 5));

            const routePush = requests.find((item) => item.source === "office" && item.type === "ROUTE_PUSH");
            if (routePush) setLastAction(routePush.message);
          }
        })
        .catch((err) => console.error("Driver requests fetch failed", err));
    };

    loadRequests();
    const timer = window.setInterval(loadRequests, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vehicleSelected, vehicle.fleetNo]);

  if (!driverProfile) {
    return (
      <main className="driver-select-page">
        <section className="driver-select-card driver-login-card">
          <h1>Coach Ops Driver</h1>
          <p>Enter your employee number to open the driver tablet.</p>

          <label className="driver-login-label">
            Employee number
            <input
              className="driver-login-input"
              value={employeeIdInput}
              inputMode="numeric"
              autoFocus
              placeholder="1600026"
              onChange={(event) => {
                setEmployeeIdInput(event.target.value);
                setLoginError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") loginDriver();
              }}
            />
          </label>

          {loginError && <div className="tracking-error driver-login-error">{loginError}</div>}

          <button className="driver-start-button" onClick={loginDriver}>
            Log in
          </button>

        </section>
      </main>
    );
  }


  if (navMode && routeSummary) {
    return (
      <main className="satnav-page">
        <section className="satnav-top-card">
          <div>
            <strong>{vehicle.fleetNo} · {vehicle.reg}</strong>
            <p>{routeSummary.destination}</p>
          </div>
          <button onClick={() => setNavMode(false)}>Route overview</button>
        </section>

        {pendingRoutePush && (
          <section className="driver-route-update-banner nav-route-push">
            <div>
              <strong>New route from Control</strong>
              <p>{pendingRoutePush.route?.destination || "Updated route"}</p>
            </div>
            <button onClick={acceptRoutePush}>Accept</button>
            <button onClick={declineRoutePush}>Decline</button>
          </section>
        )}

        <section className="satnav-map-wrap">
          <div className="satnav-instruction-card">
            <div className="satnav-distance">{formatMetres(nextStepDistance ?? nextStep?.distanceMetres)}</div>
            <div>
              <h1>{nextStep?.instruction || "Follow current route"}</h1>
              <p>{offRoute ? "Recalculating route" : (nextStep?.roadName || routeSummary.destination)}</p>
            </div>
          </div>

          <div className="satnav-eta-strip">
            <span>ETA <strong>{etaFromMinutes(remainingNav.minutes)}</strong></span>
            <span>Remaining <strong>{remainingNav.miles || "--"} mi</strong></span>
            <span>Engine <strong>{routeSummary.engine || "route"}</strong></span>
          </div>

          <RouteMap
            height="calc(100vh - 190px)"
            fleetNo={vehicle.fleetNo}
            reg={vehicle.reg}
            liveTracking
            followCoach
            navigationMode
            fitRoute={false}
            routeOverride={routeSummary}
          />

          <div className="satnav-speed-panel">
            <div className="speed-limit-circle">
              <span>TRAFFIC</span>
              <strong>{trafficFlow?.currentSpeed != null ? Math.round(Number(trafficFlow.currentSpeed)) : '--'}</strong>
              <small>{trafficFlow?.freeFlowSpeed != null ? `free ${Math.round(Number(trafficFlow.freeFlowSpeed))} mph` : 'TomTom flow'}</small>
            </div>
            <div className="current-speed-box">
              <span>YOU</span>
              <strong>{currentMph(lastPosition?.speedMps)}</strong>
              <small>mph</small>
            </div>
          </div>

          <div className="satnav-actions">
            <button className="call" onClick={() => notify("Driver requested phone call from Control", "CALL_CONTROL")}>📞 Office</button>
            <button className="breakdown" onClick={() => notify("HELP REQUEST - driver needs assistance", "HELP_REQUEST")}>🚨 Help</button>
          </div>
        </section>

      </main>
    );
  }

  const latestOfficeMessages = officeRequests.filter((item) => item.source === "office");

  return (
    <main className="driver-only-page">
      <header className="driver-only-header">
        <div>
          <h1>Coach Ops Driver</h1>
          <p>Logged in · {vehicle.fleetNo} · {vehicle.reg}</p>
        </div>
        <span>{tracking ? "GPS LIVE" : "GPS WAITING"}</span>
      </header>

      <section className="driver-current-vehicle-card">
        <div>
          <strong>Current vehicle</strong>
          <h2>{vehicle.fleetNo} · {vehicle.reg}</h2>
          <p>{vehicle.operator} · {vehicle.depot}</p>
        </div>
        <details className="driver-change-vehicle-panel">
          <summary>Change vehicle</summary>
          <div className="driver-company-tabs">
            {companies.map((company) => (
              <button
                key={company}
                type="button"
                className={company === selectedCompany ? "active" : ""}
                onClick={() => setSelectedCompany(company)}
              >
                {company}
              </button>
            ))}
          </div>
          <div className="driver-vehicle-list compact">
            {companyVehicles.map((item) => (
              <button
                key={item.fleetNo}
                className={item.fleetNo === vehicle.fleetNo ? "vehicle-select active" : "vehicle-select"}
                onClick={() => switchVehicle(item)}
              >
                <strong>{item.fleetNo}</strong>
                <span>{item.reg}</span>
                <small>{item.operator} · {item.depot}</small>
              </button>
            ))}
          </div>
        </details>
      </section>

      {pendingRoutePush && (
        <section className="driver-route-update-banner">
          <div>
            <strong>Route update available from Control</strong>
            <p>{pendingRoutePush.route?.destination || "Updated route"}</p>
          </div>
          <button onClick={acceptRoutePush}>View & Accept</button>
          <button onClick={declineRoutePush}>Decline</button>
        </section>
      )}

      {routeSummary && (
        <section className="driver-assigned-route-card">
          <div>
            <strong>Assigned Route</strong>
            <h2>{routeSummary.routeNumber ? `${routeSummary.routeNumber} · ` : ''}{routeSummary.routeName || routeSummary.destination}</h2>
            <p>{routeSummary.stops?.length ? `${routeSummary.stops.join(' → ')} → ` : ''}{routeSummary.destination}</p>
            <small>{routeSummary.distanceMiles || '--'} miles · approx {routeSummary.durationMinutes || '--'} mins · {routeSummary.engine || 'route'}</small>
          </div>
          <button type="button" onClick={() => { setNavMode(true); requestWakeLock(); }}>Navigate</button>
        </section>
      )}

      <section className="driver-route-planner-card route-card-large">
        <div>
          <h2>Set Route</h2>
          <p>Search supports streets, stations, airports, venues and services.</p>
        </div>

        <div className="driver-route-inputs route-inputs-wide">
          <PlaceSearchBox label="Destination" value={destination} setValue={setDestination} placeholder="Scarborough Station, Big Ben, Manchester Airport T2..." />
          <PlaceSearchBox label="Add stop / services" value={stopInput} setValue={setStopInput} placeholder="Birch Services, Wetherby, Esk Valley Coaches..." />
        </div>

        <button type="button" onClick={addStop}>+ Add Stop</button>

        {stops.length > 0 && (
          <div className="route-stop-pills">
            {stops.map((stop, index) => (
              <span key={`${stop}-${index}`}>{stop}<button onClick={() => setStops((current) => current.filter((_, i) => i !== index))}>×</button></span>
            ))}
          </div>
        )}

        <button type="button" onClick={planRoute}>🗺 Set Route + Enter Nav Mode</button>
        <p className="route-status">{routeStatus}</p>
      </section>

      {latestOfficeMessages.length > 0 && (
        <section className="driver-card office-message-card">
          <h3>Office Messages</h3>
          {latestOfficeMessages.map((item) => (
            <div className="office-message-item" key={item.id}>
              <strong>{item.type}</strong>
              <p>{item.message}</p>
              <small>{new Date(item.createdAt).toLocaleTimeString("en-GB")}</small>
            </div>
          ))}
        </section>
      )}

      <section className="driver-only-grid">
        <aside className="driver-only-left">
          <article className="driver-card">
            <h3>Journey</h3>
            <p><strong>Fleet No:</strong> {vehicle.fleetNo}</p>
            <p><strong>Vehicle:</strong> {vehicle.reg}</p>
            <p><strong>Depot:</strong> {vehicle.depot}</p>
            <p><strong>Stops:</strong> {stops.length ? stops.join(" → ") : "None"}</p>
            <p><strong>Destination:</strong> {destination || "Not set"}</p>
          </article>

          <article className="driver-card passenger-card">
            <h3>Passengers On Board</h3>
            <p className="driver-passenger-number">{passengers}</p>
            <div className="driver-counter-buttons">
              <button onClick={() => setPassengers(Math.max(0, passengers - 1))}>➖ Left</button>
              <button onClick={() => setPassengers(passengers + 1)}>➕ Boarded</button>
            </div>
          </article>
        </aside>

        <section className="driver-only-map">
          <div className="driver-map-title">
            <h2>Live Route Map</h2>
            <span>Waiting for route setup</span>
          </div>
          <RouteMap
            height="calc(100vh - 285px)"
            fleetNo={vehicle.fleetNo}
            reg={vehicle.reg}
            liveTracking
            followCoach
            fitRoute={false}
            routeOverride={routeSummary}
          />
        </section>

        <aside className="driver-only-right">
          <DriverIntel />

          <article className="driver-card">
            <h3>Message Control</h3>
            <textarea
              className="driver-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Running late, passenger issue, service stop full..."
            />
            <button
              onClick={() => {
                const text = message.trim() || "Driver sent a blank check-in";
                setMessage("");
                notify(text, "DRIVER_MESSAGE");
              }}
            >
              Send Message
            </button>
          </article>

          <div className="driver-control-buttons">
            <button className="call" onClick={() => notify("Driver requested phone call from Control", "CALL_CONTROL")}>📞 Call Office</button>
            <button className="report" onClick={() => notify("Driver reported an issue", "ISSUE_REPORT")}>⚠️ Report Issue</button>
            <button className="breakdown" onClick={() => notify("Breakdown alert sent to Control", "BREAKDOWN")}>🛠 Breakdown</button>
            <button className="passengers" onClick={() => notify(`Passenger count sent: ${passengers}`, "PASSENGER_COUNT")}>👥 Send Count</button>
          </div>

          <div className="driver-last-action">{lastAction}</div>
          {trackingError && <div className="tracking-error">{trackingError}</div>}
        </aside>
      </section>
    </main>
  );
}
