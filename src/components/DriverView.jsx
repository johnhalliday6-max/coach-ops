import { useEffect, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";
import { fleetData } from "../data/fleetData";

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
  const [routeStatus, setRouteStatus] = useState("Set your route once GPS has a position");
  const [routeSummary, setRouteSummary] = useState(null);
  const watchId = useRef(null);

  const notify = (text) => {
    setLastAction(text);
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      setLastAction(`Tracking live for ${vehicle.fleetNo} / ${vehicle.reg}`);
    } catch (error) {
      console.error(error);
      setTrackingError("Could not send GPS to office");
    }
  };

  const planRoute = async () => {
    if (!lastPosition?.lat || !lastPosition?.lng) {
      setRouteStatus("Start GPS tracking first so we can route from your current location");
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
        headers: {
          "Content-Type": "application/json",
        },
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
        headers: {
          "Content-Type": "application/json",
        },
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
    } catch (error) {
      console.error(error);
      setRouteStatus("Route planner failed");
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setTrackingError("This phone/browser does not support GPS tracking");
      return;
    }

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

  useEffect(() => {
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  if (!vehicleSelected) {
    return (
      <main className="driver-select-page">
        <section className="driver-select-card">
          <h1>Coach Ops Driver</h1>
          <p>Select the vehicle you are taking tonight.</p>

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
            }}
          >
            Continue with {vehicle.fleetNo} / {vehicle.reg}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="driver-only-page">
      <header className="driver-only-header">
        <div>
          <h1>Coach Ops Driver</h1>
          <p>
            {vehicle.fleetNo} · {vehicle.reg} · York → Peterborough Services →
            {destination || "Destination"}
          </p>
        </div>
        <span>{tracking ? "GPS LIVE" : "LIVE TEST"}</span>
      </header>

      <section className="driver-navigation-card tracking-card">
        <div>
          <strong>Phone GPS Tracking</strong>
          <p>
            This uses your phone location. Keep this page open to send your
            position to the office map.
          </p>
          {lastPosition && (
            <p className="tracking-small">
              Last update: {new Date(lastPosition.updatedAt).toLocaleTimeString("en-GB")} · Speed:{" "}
              {mph(lastPosition.speedMps)} · Accuracy: ±
              {Math.round(lastPosition.accuracy || 0)}m
            </p>
          )}
          {trackingError && <p className="tracking-error">{trackingError}</p>}
        </div>

        {!tracking ? (
          <button onClick={startTracking}>📡 Start Tracking</button>
        ) : (
          <button className="stop-tracking" onClick={stopTracking}>
            ⏹ Stop Tracking
          </button>
        )}
      </section>

      <section className="driver-route-planner-card">
        <div>
          <h2>Set Route</h2>
          <p>Uses your phone GPS as the start point, then sends the route to the office map.</p>
        </div>

        <div className="driver-route-inputs">
          <label>Destination</label>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Example: Manchester Airport T2"
          />

          <label>Optional stop / services</label>
          <input
            value={waypoint}
            onChange={(event) => setWaypoint(event.target.value)}
            placeholder="Example: Peterborough Services"
          />
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
            <p>
              <strong>Booking:</strong> P12440/20519
            </p>
            <p>
              <strong>Fleet No:</strong> {vehicle.fleetNo}
            </p>
            <p>
              <strong>Vehicle:</strong> {vehicle.reg}
            </p>
            <p>
              <strong>Depot:</strong> {vehicle.depot}
            </p>
            <p>
              <strong>Next stop:</strong> Peterborough Services
            </p>
            <p>
              <strong>Destination:</strong> {destination || "Not set"}
            </p>
          </article>

          <article className="driver-card passenger-card">
            <h3>Passengers On Board</h3>
            <p className="driver-passenger-number">{passengers}</p>
            <div className="driver-counter-buttons">
              <button
                onClick={() => setPassengers(Math.max(0, passengers - 1))}
              >
                ➖ Left
              </button>
              <button onClick={() => setPassengers(passengers + 1)}>
                ➕ Boarded
              </button>
            </div>
          </article>

          <article className="driver-card">
            <h3>Route Progress</h3>
            <div className="driver-progress-list">
              <div>✅ York</div>
              <div className="active-stop">🟡 Peterborough Services</div>
              <div>⬜ {destination || "Destination"}</div>
            </div>
          </article>
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

          <article className="driver-card warning">
            <h3>Route Alert</h3>
            <p>M1 southbound J33 to J32 Lane 1 closure</p>
            <button onClick={() => notify("Diversion request sent to Control")}>
              Request Diversion
            </button>
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
                setMessage("");
                notify("Message sent to Control");
              }}
            >
              Send Message
            </button>
          </article>

          <div className="driver-control-buttons">
            <button
              className="call"
              onClick={() => notify("Calling Control...")}
            >
              📞 Call Control
            </button>
            <button
              className="report"
              onClick={() => notify("Issue reported to Control")}
            >
              ⚠️ Report Issue
            </button>
            <button
              className="breakdown"
              onClick={() => notify("Breakdown alert sent to Control")}
            >
              🛠 Breakdown
            </button>
            <button
              className="passengers"
              onClick={() => notify(`Passenger count sent: ${passengers}`)}
            >
              👥 Send Count
            </button>
          </div>

          <div className="driver-last-action">{lastAction}</div>
        </aside>
      </section>
    </main>
  );
}
