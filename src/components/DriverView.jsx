import { useEffect, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";
import { fleetData } from "../data/fleetData";

const PLACE_SUGGESTIONS = [
  "Manchester Airport Terminal 1",
  "Manchester Airport Terminal 2",
  "Manchester Airport Terminal 3",
  "Leeds Bradford Airport",
  "Newcastle Airport",
  "London Victoria Coach Station",
  "York Station",
  "York Racecourse",
  "Peterborough Services",
  "Ferrybridge Services",
  "Wetherby Services",
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
  const [waypoint, setWaypoint] = useState("Peterborough Services");
  const [routeStatus, setRouteStatus] = useState("Select vehicle to start live GPS");
  const [routeSummary, setRouteSummary] = useState(null);
  const [officeRequests, setOfficeRequests] = useState([]);
  const watchId = useRef(null);

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

    setLastPosition({
      ...payload,
      updatedAt: new Date().toISOString(),
    });

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
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
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

  const planRoute = async () => {
    if (!lastPosition?.lat || !lastPosition?.lng) {
      setRouteStatus("Waiting for GPS fix before building route");
      return;
    }

    if (!destination.trim()) {
      setRouteStatus("Enter a destination first");
      return;
    }

    setRouteStatus("Building route...");

    try {
      const routeResponse = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: lastPosition.lat,
          startLng: lastPosition.lng,
          destination,
          waypoint,
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
          waypoint,
          ...route,
        }),
      });

      setRouteSummary(route);
      setRouteStatus(`Route live: ${route.distanceMiles} miles · approx ${route.durationMinutes} mins`);
      setLastAction(`Route shared with office for ${vehicle.fleetNo}`);
      await postOfficeRequest(
        "ROUTE_SET",
        `Driver set route to ${destination}${waypoint ? ` via ${waypoint}` : ""}`,
      );
    } catch (error) {
      console.error(error);
      setRouteStatus("Route planner failed");
    }
  };

  useEffect(() => {
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!vehicleSelected) return undefined;

    let cancelled = false;

    const loadRequests = () => {
      fetch(`/api/requests?vehicle=${encodeURIComponent(vehicle.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setOfficeRequests((data.requests || []).slice(0, 5));
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
          <p>Select the vehicle you are taking tonight. Tracking starts automatically once you continue.</p>

          <div className="driver-vehicle-list">
            {fleetData.map((item) => (
              <button
                key={item.fleetNo}
                className={
                  item.fleetNo === vehicle.fleetNo
                    ? "vehicle-select active"
                    : "vehicle-select"
                }
                onClick={() => setVehicle(item)}
              >
                <strong>{item.fleetNo}</strong>
                <span>{item.reg}</span>
                <small>
                  {item.operator} · {item.depot}
                </small>
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
            Continue and start tracking {vehicle.fleetNo} / {vehicle.reg}
          </button>
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
          <p>
            {vehicle.fleetNo} · {vehicle.reg} · Current route to {destination || "Destination"}
          </p>
        </div>
        <span>{tracking ? "GPS LIVE" : "GPS WAITING"}</span>
      </header>

      <section className="driver-navigation-card tracking-card">
        <div>
          <strong>Phone GPS Tracking</strong>
          <p>
            Tracking starts automatically after vehicle selection. Keep this page open to send your position to the office map.
          </p>
          {lastPosition && (
            <p className="tracking-small">
              Last update: {new Date(lastPosition.updatedAt).toLocaleTimeString("en-GB")} · Speed: {mph(lastPosition.speedMps)} · Accuracy: ±{Math.round(lastPosition.accuracy || 0)}m
            </p>
          )}
          {trackingError && <p className="tracking-error">{trackingError}</p>}
        </div>

        {tracking ? (
          <button className="stop-tracking" onClick={stopTracking}>⏹ Stop Tracking</button>
        ) : (
          <button onClick={startTracking}>📡 Restart Tracking</button>
        )}
      </section>

      <section className="driver-route-planner-card">
        <div>
          <h2>Set Route</h2>
          <p>Uses your phone GPS as the start point and sends the route to the office map.</p>
        </div>

        <div className="driver-route-inputs">
          <label>Destination</label>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Example: Manchester Airport T2"
            list="place-suggestions"
          />

          <label>Optional stop / services</label>
          <input
            value={waypoint}
            onChange={(event) => setWaypoint(event.target.value)}
            placeholder="Example: Peterborough Services"
            list="place-suggestions"
          />

          <datalist id="place-suggestions">
            {PLACE_SUGGESTIONS.map((place) => (
              <option value={place} key={place} />
            ))}
          </datalist>
        </div>

        <button onClick={planRoute}>🗺 Set Route On Map</button>

        <p className="route-status">{routeStatus}</p>
        {routeSummary && (
          <p className="route-status strong">
            Distance: {routeSummary.distanceMiles} miles · Drive time: {routeSummary.durationMinutes} mins
          </p>
        )}
      </section>

      <section className="driver-only-grid">
        <aside className="driver-only-left">
          <article className="driver-card">
            <h3>Journey</h3>
            <p><strong>Booking:</strong> P12440/20519</p>
            <p><strong>Fleet No:</strong> {vehicle.fleetNo}</p>
            <p><strong>Vehicle:</strong> {vehicle.reg}</p>
            <p><strong>Depot:</strong> {vehicle.depot}</p>
            <p><strong>Next stop:</strong> {waypoint || "Not set"}</p>
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

          <article className="driver-card">
            <h3>Route Progress</h3>
            <div className="driver-progress-list">
              <div>✅ Current Location</div>
              {waypoint && <div className="active-stop">🟡 {waypoint}</div>}
              <div>⬜ {destination || "Destination"}</div>
            </div>
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

        <section className="driver-only-map">
          <div className="driver-map-title">
            <h2>Live Route Map</h2>
            <span>Closures and your coach plotted live</span>
          </div>
          <RouteMap
            height="calc(100vh - 285px)"
            fleetNo={vehicle.fleetNo}
            reg={vehicle.reg}
            liveTracking={!tracking}
          />
        </section>

        <aside className="driver-only-right">
          <DriverIntel />

          {routeSummary?.instructions?.length > 0 && (
            <article className="driver-card turn-card">
              <h3>Turn-by-turn</h3>
              <div className="turn-list">
                {routeSummary.instructions.slice(0, 10).map((step) => (
                  <div className="turn-item" key={step.id}>
                    <strong>{step.instruction}</strong>
                    <small>{step.distanceMiles} mi · {step.durationMinutes} mins</small>
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
            <textarea
              className="driver-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Example: running 15 minutes late, passengers onboard 34..."
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
            <button className="call" onClick={() => notify("Driver requested phone call from Control", "CALL_CONTROL")}>📞 Call Control</button>
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
