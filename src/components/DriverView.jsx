import { useEffect, useMemo, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";
import { fleetData } from "../data/fleetData";

const QUICK_STOPS = [
  "Peterborough Services",
  "Wetherby Services",
  "Ferrybridge Services",
  "Scotch Corner Services",
  "Washington Services",
  "Woodall Services",
  "Tibshelf Services",
  "Cambridge Services",
  "Leeming Bar Services",
];

function mph(speedMps) {
  if (speedMps == null || Number.isNaN(Number(speedMps))) return "Waiting";
  return `${Math.round(Number(speedMps) * 2.23694)} mph`;
}

function formatInstruction(step) {
  if (!step) return { main: "Route not set", sub: "Enter destination and press Set Route" };

  return {
    main: step.instruction || "Continue",
    sub: [step.distanceText || `${step.distanceMiles} mi`, step.laneHint].filter(Boolean).join(" · "),
  };
}

function RouteSuggestInput({ label, value, onChange, placeholder, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) setSuggestions(data.suggestions || []);
        })
        .catch((err) => console.error("Suggestion fetch failed", err));
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="suggest-wrap">
      <label>{label}</label>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && suggestions.length > 0 && (
        <div className="suggest-list">
          {suggestions.map((item) => (
            <button
              key={item.name}
              type="button"
              onMouseDown={() => {
                onChange(item.name);
                onSelect?.(item.name);
                setOpen(false);
              }}
            >
              <strong>{item.name}</strong>
              <small>{item.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [destination, setDestination] = useState("London Victoria Coach Station");
  const [stopInput, setStopInput] = useState("Peterborough Services");
  const [stops, setStops] = useState(["Peterborough Services"]);
  const [routeStatus, setRouteStatus] = useState("Select vehicle to start live GPS");
  const [routeSummary, setRouteSummary] = useState(null);
  const [officeRequests, setOfficeRequests] = useState([]);
  const [pendingOfficeRoute, setPendingOfficeRoute] = useState(null);
  const watchId = useRef(null);

  const currentStep = routeSummary?.nextInstruction || routeSummary?.instructions?.[1] || routeSummary?.instructions?.[0];
  const nextDisplay = formatInstruction(currentStep);
  const speedText = mph(lastPosition?.speedMps);

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
    alert(text);
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

  const startTracking = () => {
    if (!navigator.geolocation) {
      setTrackingError("This phone/browser does not support GPS tracking");
      return;
    }
    if (watchId.current != null) return;

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
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  };

  const stopTracking = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
    setLastAction("Tracking stopped");
  };

  const addStop = (stop = stopInput) => {
    const clean = String(stop || "").trim();
    if (!clean) return;
    if (!stops.includes(clean)) setStops((current) => [...current, clean]);
    setStopInput("");
  };

  const removeStop = (stop) => {
    setStops((current) => current.filter((item) => item !== stop));
  };

  const planRoute = async (source = "driver", status = "accepted") => {
    if (!lastPosition?.lat || !lastPosition?.lng) {
      setRouteStatus("Waiting for GPS fix before building route");
      return null;
    }
    if (!destination.trim()) {
      setRouteStatus("Enter a destination first");
      return null;
    }

    setRouteStatus("Building route and sat-nav steps...");

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
        return null;
      }

      const route = routeData.route;
      await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: vehicle.fleetNo,
          reg: vehicle.reg,
          destination,
          stops,
          source,
          status,
          ...route,
        }),
      });

      setRouteSummary(route);
      setRouteStatus(`Route live: ${route.distanceMiles} miles · approx ${route.durationMinutes} mins`);
      setLastAction(`Route shared with office for ${vehicle.fleetNo}`);
      await postOfficeRequest("ROUTE_SET", `Driver set route to ${destination}${stops.length ? ` via ${stops.join(", ")}` : ""}`);
      return route;
    } catch (error) {
      console.error(error);
      setRouteStatus("Route planner failed");
      return null;
    }
  };

  const acceptOfficeRoute = async () => {
    if (!pendingOfficeRoute) return;

    try {
      await fetch("/api/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetNo: vehicle.fleetNo, action: "accept" }),
      });
      setDestination(pendingOfficeRoute.destination || destination);
      setStops(pendingOfficeRoute.stops || []);
      setRouteSummary(pendingOfficeRoute);
      setPendingOfficeRoute(null);
      setLastAction("New route accepted");
      await postOfficeRequest("ROUTE_ACCEPTED", "Driver accepted route update");
    } catch (error) {
      console.error(error);
      alert("Could not accept route update");
    }
  };

  const declineOfficeRoute = async () => {
    try {
      await fetch("/api/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetNo: vehicle.fleetNo, action: "decline" }),
      });
      setPendingOfficeRoute(null);
      setLastAction("Route update declined");
      await postOfficeRequest("ROUTE_DECLINED", "Driver declined route update");
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  useEffect(() => {
    if (!vehicleSelected) return undefined;
    let cancelled = false;

    const load = () => {
      fetch(`/api/requests?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) setOfficeRequests((data.requests || []).slice(0, 5));
        })
        .catch((err) => console.error("Driver requests fetch failed", err));

      fetch(`/api/routes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data?.ok || !data.route) return;
          if (data.route.source === "office" && data.route.status === "pending") {
            setPendingOfficeRoute(data.route);
          } else if (data.route.status === "accepted" && data.route.geometry?.length) {
            setRouteSummary(data.route);
          }
        })
        .catch((err) => console.error("Driver route fetch failed", err));
    };

    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vehicleSelected, vehicle.fleetNo]);

  const latestOfficeMessages = officeRequests.filter((item) => item.source === "office");

  if (!vehicleSelected) {
    return (
      <main className="driver-select-page">
        <section className="driver-select-card">
          <h1>Coach Ops Driver</h1>
          <p>Select your vehicle. GPS tracking starts automatically and appears on the office map.</p>

          <div className="driver-vehicle-list">
            {fleetData.map((item) => (
              <button
                key={item.fleetNo}
                className={item.fleetNo === vehicle.fleetNo ? "vehicle-select active" : "vehicle-select"}
                onClick={() => {
                  setVehicle(item);
                  setVehicleSelected(true);
                  setLastAction(`Vehicle assigned: ${item.fleetNo} / ${item.reg}`);
                  window.setTimeout(startTracking, 0);
                }}
              >
                <strong>{item.fleetNo}</strong>
                <span>{item.reg}</span>
                <small>{item.operator} · {item.depot}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="driver-only-page satnav-mode">
      <header className="driver-only-header">
        <div>
          <h1>Coach Ops Driver</h1>
          <p>{vehicle.fleetNo} · {vehicle.reg} · {destination || "Destination not set"}</p>
        </div>
        <span>{tracking ? "GPS LIVE" : "GPS WAITING"}</span>
      </header>

      {pendingOfficeRoute && (
        <section className="route-update-banner">
          <div>
            <strong>⚠ ROUTE UPDATE AVAILABLE</strong>
            <p>Control sent a new route to {pendingOfficeRoute.destination}</p>
            <small>{pendingOfficeRoute.distanceMiles} miles · {pendingOfficeRoute.durationMinutes} mins</small>
          </div>
          <div className="route-update-actions">
            <button onClick={acceptOfficeRoute}>View & Accept</button>
            <button className="secondary" onClick={declineOfficeRoute}>Decline</button>
          </div>
        </section>
      )}

      <section className="satnav-grid">
        <aside className="satnav-left">
          <article className="driver-card">
            <h3>Job Overview</h3>
            <p><strong>Booking:</strong> P12440/20519</p>
            <p><strong>Fleet No:</strong> {vehicle.fleetNo}</p>
            <p><strong>Vehicle:</strong> {vehicle.reg}</p>
            <p><strong>Depot:</strong> {vehicle.depot}</p>
            <p><strong>GPS:</strong> {tracking ? "Live" : "Waiting"}</p>
            {lastPosition && <p><strong>Speed:</strong> {speedText}</p>}
          </article>

          <article className="driver-card passenger-card">
            <h3>Passengers</h3>
            <p className="driver-passenger-number">{passengers}</p>
            <div className="driver-counter-buttons">
              <button onClick={() => setPassengers(Math.max(0, passengers - 1))}>➖ Left</button>
              <button onClick={() => setPassengers(passengers + 1)}>➕ Boarded</button>
            </div>
          </article>

          <article className="driver-card route-builder-card">
            <h3>Set Route</h3>
            <RouteSuggestInput
              label="Destination"
              value={destination}
              onChange={setDestination}
              placeholder="Type destination..."
            />
            <RouteSuggestInput
              label="Add stop / services"
              value={stopInput}
              onChange={setStopInput}
              onSelect={addStop}
              placeholder="Type stop then Add..."
            />
            <button onClick={() => addStop()}>+ Add Stop</button>
            <div className="stop-chip-list">
              {stops.map((stop) => (
                <span className="stop-chip" key={stop}>{stop}<button onClick={() => removeStop(stop)}>×</button></span>
              ))}
            </div>
            <button className="driver-primary" onClick={() => planRoute()}>🗺 Set Route</button>
            <p className="route-status">{routeStatus}</p>
          </article>

          {latestOfficeMessages.length > 0 && (
            <article className="driver-card office-message-card">
              <h3>Office Messages</h3>
              {latestOfficeMessages.map((item) => (
                <div className="office-message-item" key={item.id}>
                  <strong>{item.type}</strong>
                  <p>{item.message}</p>
                  <small>{new Date(item.createdAt).toLocaleTimeString("en-GB")}</small>
                </div>
              ))}
            </article>
          )}
        </aside>

        <section className="satnav-main">
          <div className="satnav-map-card">
            <RouteMap
              height="calc(100vh - 170px)"
              fleetNo={vehicle.fleetNo}
              reg={vehicle.reg}
              liveTracking={!tracking}
            />
            <div className="satnav-overlay-top">
              <div className="next-turn-distance">{nextDisplay.sub || "Set route"}</div>
              <div>
                <strong>{nextDisplay.main}</strong>
                <small>{currentStep?.roadName || "Live route guidance"}</small>
              </div>
            </div>
            <div className="satnav-speed-badge">
              <strong>{speedText === "Waiting" ? "--" : speedText.replace(" mph", "")}</strong>
              <span>mph</span>
            </div>
            {currentStep?.laneHint && <div className="satnav-lane-hint">{currentStep.laneHint}</div>}
          </div>
        </section>

        <aside className="satnav-right">
          <DriverIntel />

          {routeSummary?.instructions?.length > 0 && (
            <article className="driver-card turn-card">
              <h3>Upcoming Directions</h3>
              <div className="turn-list">
                {routeSummary.instructions.slice(0, 12).map((step) => (
                  <div className="turn-item" key={step.id}>
                    <strong>{step.instruction}</strong>
                    <small>{step.distanceText || `${step.distanceMiles} mi`} · {step.durationMinutes} mins</small>
                    {step.laneHint && <em>{step.laneHint}</em>}
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="driver-card warning">
            <h3>Route Alert</h3>
            <p>M1 southbound J33 to J32 Lane 1 closure</p>
            <button onClick={() => notify("Diversion request sent to Control", "DIVERSION_REQUEST")}>Request Diversion</button>
          </article>

          <article className="driver-card">
            <h3>Message Control</h3>
            <textarea className="driver-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Running late, passenger issue, service stop full..." />
            <button onClick={() => {
              const text = message.trim() || "Driver sent a blank check-in";
              setMessage("");
              notify(text, "DRIVER_MESSAGE");
            }}>Send Message</button>
          </article>

          <div className="driver-control-buttons">
            <button className="call" onClick={() => notify("Driver requested phone call from Control", "CALL_CONTROL")}>📞 Call Office</button>
            <button className="report" onClick={() => notify("Driver reported an issue", "ISSUE_REPORT")}>⚠️ Report Issue</button>
            <button className="breakdown" onClick={() => notify("Breakdown alert sent to Control", "BREAKDOWN")}>🛠 Breakdown</button>
            <button className="passengers" onClick={() => notify(`Passenger count sent: ${passengers}`, "PASSENGER_COUNT")}>👥 Send Count</button>
          </div>

          <div className="driver-last-action">{lastAction}</div>
        </aside>
      </section>
    </main>
  );
}
