import { useEffect, useMemo, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";
import { fleetData } from "../data/fleetData";
import PlaceSearchBox from "./PlaceSearchBox";


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
  const defaultVehicle =
    fleetData.find((vehicle) => vehicle.reg === "YJ72 CGG") ||
    selectedFleet ||
    fleetData[0];

  const [vehicle, setVehicle] = useState(defaultVehicle);
  const [vehicleSelected, setVehicleSelected] = useState(false);
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

  const postOfficeRequest = async (type, text, source = "driver") => {
    try {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: vehicle.fleetNo,
          reg: vehicle.reg,
          operator: vehicle.operator,
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

  const notify = (text, type = "INFO") => {
    setLastAction(text);
    postOfficeRequest(type, text);
  };

  const postLocation = async (position) => {
    const coords = position.coords;

    const payload = {
      fleetNo: vehicle.fleetNo,
      reg: vehicle.reg,
      operator: vehicle.operator,
      depot: vehicle.depot,
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
      setLastAction(`Tracking live for ${vehicle.fleetNo} / ${vehicle.reg}`);
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
    setRouteSummary(null);
    setActiveStepIndex(0);
    setOffRoute(false);
    await fetch(`/api/routes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`, { method: "DELETE" }).catch(() => {});

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

      await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: vehicle.fleetNo,
          reg: vehicle.reg,
          destination,
          waypoint: stops.join(" → "),
          stops,
          ...route,
        }),
      });

      setRouteSummary(route);
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
    await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fleetNo: vehicle.fleetNo,
        reg: vehicle.reg,
        ...route,
      }),
    });
    setDestination(route.destination || destination);
    setStops(Array.isArray(route.stops) ? route.stops : []);
    setRouteSummary(route);
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
    if (!lastPosition || !routeSummary) return;

    const currentPoint = { lat: lastPosition.lat, lng: lastPosition.lng };
    const nextIndex = nearestInstructionIndex(currentPoint, routeSummary.instructions || []);
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

  if (!vehicleSelected) {
    return (
      <main className="driver-select-page">
        <section className="driver-select-card">
          <h1>Coach Ops Driver</h1>
          <p>Select tonight's vehicle. GPS tracking starts automatically after selection.</p>
          <div className="driver-vehicle-list">
            {fleetData.map((item) => (
              <button
                key={item.fleetNo}
                className={item.fleetNo === vehicle.fleetNo ? "vehicle-select active" : "vehicle-select"}
                onClick={() => setVehicle(item)}
              >
                <strong>{item.fleetNo}</strong>
                <span>{item.reg}</span>
                <small>{item.operator} · {item.depot}</small>
              </button>
            ))}
          </div>
          <button
            className="driver-start-button"
            onClick={() => {
              setVehicleSelected(true);
              setLastAction(`Vehicle assigned: ${vehicle.fleetNo} / ${vehicle.reg}`);
              window.setTimeout(startTracking, 0);
            }}
          >
            Continue with {vehicle.fleetNo} / {vehicle.reg}
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
            <span>ETA <strong>{etaFromMinutes(routeSummary.durationMinutes)}</strong></span>
            <span>Remaining <strong>{routeSummary.distanceMiles || "--"} mi</strong></span>
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
          />

          <div className="satnav-speed-panel">
            <div className="speed-limit-circle">
              <span>LIMIT</span>
              <strong>--</strong>
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
          <p>{vehicle.fleetNo} · {vehicle.reg} · GPS start point used for routes</p>
        </div>
        <span>{tracking ? "GPS LIVE" : "GPS WAITING"}</span>
      </header>

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
