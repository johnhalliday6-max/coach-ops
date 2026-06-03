import { useEffect, useState } from "react";
import "./App.css";
import logo from "./assets/goahead-logo.png";
import { fleetData } from "./data/fleetData";
import { coachParking } from "./data/coachParking";
import { serviceAreas } from "./data/serviceAreas";
import { depots } from "./data/depots";
import RouteMap from "./components/RouteMap";
import HighwaysLive from "./components/HighwaysLive";
import DriverView from "./components/DriverView";

function App() {
  const [selectedFleet, setSelectedFleet] = useState(fleetData[0]);
  const [search, setSearch] = useState("");
  const isDriverOnly =
    window.location.pathname === "/driver" ||
    new URLSearchParams(window.location.search).get("mode") === "driver";
  const [activePage, setActivePage] = useState(
    isDriverOnly ? "driver" : "dashboard",
  );
  const [officeRequests, setOfficeRequests] = useState([]);
  const [officeDestination, setOfficeDestination] = useState("London Victoria Coach Station");
  const [officeStop, setOfficeStop] = useState("Peterborough Services");
  const [officeStops, setOfficeStops] = useState(["Peterborough Services"]);
  const [officeRouteStatus, setOfficeRouteStatus] = useState("No office route pushed yet");

  useEffect(() => {
    if (isDriverOnly) return undefined;

    let cancelled = false;

    const loadRequests = () => {
      fetch("/api/requests")
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            setOfficeRequests((data.requests || []).slice(0, 6));
          }
        })
        .catch((err) => console.error("Office requests fetch failed", err));
    };

    loadRequests();
    const timer = window.setInterval(loadRequests, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isDriverOnly]);

  const addOfficeStop = () => {
    const stop = officeStop.trim();
    if (!stop) return;
    if (!officeStops.includes(stop)) setOfficeStops((current) => [...current, stop]);
    setOfficeStop("");
  };

  const sendOfficeRoutePush = async () => {
    try {
      setOfficeRouteStatus("Building route for driver...");

      const routeResponse = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Whitby depot as office-side start point for tonight. Driver GPS route can overwrite this live.
          startLat: 54.486,
          startLng: -0.613,
          destination: officeDestination,
          stops: officeStops,
        }),
      });

      const routeData = await routeResponse.json();
      if (!routeData?.ok) {
        setOfficeRouteStatus(routeData?.error || "Could not build office route");
        return;
      }

      const route = routeData.route;

      await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: selectedFleet.fleetNo,
          reg: selectedFleet.reg,
          operator: selectedFleet.operator,
          depot: selectedFleet.depot,
          source: "office",
          status: "pending",
          message: `Control pushed a new route to ${officeDestination}`,
          destination: officeDestination,
          stops: officeStops,
          ...route,
        }),
      });

      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: selectedFleet.fleetNo,
          reg: selectedFleet.reg,
          operator: selectedFleet.operator,
          depot: selectedFleet.depot,
          type: "ROUTE_PUSH",
          source: "office",
          message: `New route pushed: ${officeStops.length ? `${officeStops.join(" → ")} → ` : ""}${officeDestination}`,
        }),
      });

      setOfficeRouteStatus(`Route pushed to ${selectedFleet.fleetNo}: ${route.distanceMiles} miles · ${route.durationMinutes} mins`);
      alert(`Route push sent to ${selectedFleet.fleetNo} / ${selectedFleet.reg}`);
    } catch (error) {
      console.error(error);
      setOfficeRouteStatus("Could not send route push");
      alert("Could not send route push");
    }
  };

  const filteredFleet = fleetData.filter((vehicle) => {
    const text =
      `${vehicle.fleetNo} ${vehicle.reg} ${vehicle.operator} ${vehicle.depot} ${vehicle.status}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const getStatusIcon = (status) => {
    if (status.includes("Incident")) return "🔴";
    if (status.includes("Delay")) return "🟠";
    return "🟢";
  };

  const fleetStats = {
    total: fleetData.length,
    onRoute: fleetData.filter((v) => v.status.includes("On Route")).length,
    delayed: fleetData.filter((v) => v.status.includes("Delay")).length,
    incidents: fleetData.filter((v) => v.status.includes("Incident")).length,
  };

  if (isDriverOnly) {
    return <DriverView selectedFleet={selectedFleet} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <img src={logo} alt="Go Ahead" />
          <span>Coach Operations</span>
        </div>

        <div
          className={activePage === "dashboard" ? "nav active" : "nav"}
          onClick={() => setActivePage("dashboard")}
        >
          Live Map
        </div>
        <div
          className="nav"
          onClick={() => {
            window.location.href = "/?mode=driver";
          }}
        >
          Driver Mode
        </div>
        <div
          className={activePage === "fleet" ? "nav active" : "nav"}
          onClick={() => setActivePage("fleet")}
        >
          Fleet
        </div>
        <div
          className={activePage === "depots" ? "nav active" : "nav"}
          onClick={() => setActivePage("depots")}
        >
          Depots
        </div>
        <div
          className={activePage === "routes" ? "nav active" : "nav"}
          onClick={() => setActivePage("routes")}
        >
          Routes
        </div>
        <div
          className={activePage === "drivers" ? "nav active" : "nav"}
          onClick={() => setActivePage("drivers")}
        >
          Drivers
        </div>
        <div
          className={activePage === "incidents" ? "nav active" : "nav"}
          onClick={() => setActivePage("incidents")}
        >
          Incidents
        </div>
        <div
          className={activePage === "parking" ? "nav active" : "nav"}
          onClick={() => setActivePage("parking")}
        >
          Coach Parking
        </div>
        <div
          className={activePage === "services" ? "nav active" : "nav"}
          onClick={() => setActivePage("services")}
        >
          Fuel & Services
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <input
            placeholder="Search fleet, reg, depot or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div>Alerts 🔴 3 &nbsp;&nbsp; Messages 🔴 7</div>
        </header>

        <section className="statusbar">
          <strong>Fleet: {selectedFleet.fleetNo}</strong>
          <strong>Depot: {selectedFleet.depot}</strong>
          <strong>Route: York → London Victoria</strong>
          <span className="green">{selectedFleet.status}</span>
        </section>

        <section className="statsbar">
          <div>🚍 Total: {fleetStats.total}</div>
          <div>🟢 On Route: {fleetStats.onRoute}</div>
          <div>🟠 Delayed: {fleetStats.delayed}</div>
          <div>🔴 Incidents: {fleetStats.incidents}</div>
        </section>

        {officeRequests.length > 0 && (
          <section className="office-requests-panel">
            <div className="office-requests-title">
              <h3>Driver Requests / Messages</h3>
              <span>Live from driver phones</span>
            </div>

            <div className="office-requests-grid">
              {officeRequests.map((request) => (
                <article className="office-request-card" key={request.id}>
                  <strong>{request.fleetNo} · {request.reg}</strong>
                  <span>{request.type}</span>
                  <p>{request.message}</p>
                  <small>{new Date(request.createdAt).toLocaleTimeString("en-GB")}</small>
                </article>
              ))}
            </div>
          </section>
        )}

        {activePage === "dashboard" && (
          <>
            <section className="layout">
              <div className="fleet-panel">
                <h4>SELECT FLEET</h4>

                {filteredFleet.map((vehicle) => (
                  <div
                    className={
                      vehicle.fleetNo === selectedFleet.fleetNo
                        ? "fleet active-fleet"
                        : "fleet"
                    }
                    key={vehicle.fleetNo}
                    onClick={() => setSelectedFleet(vehicle)}
                  >
                    <strong>
                      {getStatusIcon(vehicle.status)} {vehicle.fleetNo}
                    </strong>
                    <span>{vehicle.status}</span>
                  </div>
                ))}

                <div className="vehicle-card">
                  <div className="bus-icon">🚌</div>
                  <h3>{selectedFleet.fleetNo}</h3>
                  <p>Reg: {selectedFleet.reg}</p>
                  <p>Operator: {selectedFleet.operator}</p>
                  <p>Depot: {selectedFleet.depot}</p>
                  <p>Type: {selectedFleet.type}</p>
                  <p>Height: {selectedFleet.height}</p>
                  <p>Width: {selectedFleet.width}</p>
                  <p>Length: {selectedFleet.length}</p>
                  <p>Weight: {selectedFleet.weight}</p>
                </div>
              </div>

              <div className="map-panel">
                <RouteMap fleetNo={selectedFleet.fleetNo} reg={selectedFleet.reg} />
              </div>

              <div className="tools-panel office-route-tools">
                <h3>Route Tools</h3>
                <label>Destination</label>
                <input
                  value={officeDestination}
                  onChange={(event) => setOfficeDestination(event.target.value)}
                  placeholder="London Victoria Coach Station"
                />

                <label>Add stop / services</label>
                <div className="office-stop-row">
                  <input
                    value={officeStop}
                    onChange={(event) => setOfficeStop(event.target.value)}
                    placeholder="Peterborough Services"
                  />
                  <button onClick={addOfficeStop}>Add</button>
                </div>

                <div className="office-stop-list">
                  {officeStops.map((stop) => (
                    <span key={stop}>{stop}<button onClick={() => setOfficeStops((current) => current.filter((item) => item !== stop))}>×</button></span>
                  ))}
                </div>

                <button onClick={sendOfficeRoutePush}>📡 Push Route To Driver</button>
                <button onClick={() => setOfficeStops([])}>🗑 Clear Stops</button>
                <small>{officeRouteStatus}</small>

                <h3>Vehicle Check</h3>
                <p>✅ Height {selectedFleet.height}</p>
                <p>✅ Width {selectedFleet.width}</p>
                <p>✅ Length {selectedFleet.length}</p>
                <p>✅ Weight {selectedFleet.weight}</p>
              </div>
            </section>

            <HighwaysLive />

            <section className="bottom-grid">
              <div className="card incident">
                <h3>Current Issue</h3>
                <p>⚠️ M62 Junction 36</p>
                <p>Road closed due to accident</p>
                <strong>Delay: +34 min</strong>
              </div>

              <div className="card route-builder">
                <h3>Route Builder</h3>
                <p>Start — York Racecourse</p>
                <p>1 — Peterborough Services</p>
                <p>2 — A14 Junction 10</p>
                <p>3 — Cambridge Services</p>
                <p>End — London Victoria</p>
                <button>+ Add Waypoint</button>
              </div>

              <div className="card route-summary">
                <h3>Route Summary</h3>
                <p>✅ Avoids low bridges</p>
                <p>✅ Avoids weight limits</p>
                <p>✅ Avoids restricted roads</p>
                <p>✅ Vehicle safe for {selectedFleet.fleetNo}</p>
                <button onClick={sendOfficeRoutePush}>Push Route To Driver</button>
              </div>
            </section>
          </>
        )}

        {activePage === "fleet" && (
          <section className="page">
            <h2>Fleet Database</h2>

            <div className="parking-grid">
              {fleetData.map((vehicle) => (
                <div className="parking-card" key={vehicle.fleetNo}>
                  <h3>{vehicle.fleetNo}</h3>
                  <p>
                    <strong>Reg:</strong> {vehicle.reg}
                  </p>
                  <p>
                    <strong>Operator:</strong> {vehicle.operator}
                  </p>
                  <p>
                    <strong>Depot:</strong> {vehicle.depot}
                  </p>
                  <p>
                    <strong>Status:</strong> {vehicle.status}
                  </p>
                  <p>
                    <strong>Height:</strong> {vehicle.height}
                  </p>
                  <p>
                    <strong>Width:</strong> {vehicle.width}
                  </p>
                  <p>
                    <strong>Length:</strong> {vehicle.length}
                  </p>
                  <p>
                    <strong>Weight:</strong> {vehicle.weight}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "depots" && (
          <section className="page">
            <h2>Depots</h2>

            <div className="parking-grid">
              {depots.map((depot) => (
                <div className="parking-card" key={depot.id}>
                  <h3>{depot.name}</h3>
                  <p>
                    <strong>Town:</strong> {depot.town}
                  </p>
                  <p>
                    <strong>Operator:</strong> {depot.operator}
                  </p>
                  <p>
                    <strong>Facilities:</strong>
                  </p>
                  <p>{depot.facilities.join(", ")}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "parking" && (
          <section className="page">
            <h2>Coach Parking</h2>

            <div className="parking-grid">
              {coachParking.map((place) => (
                <div className="parking-card" key={place.id}>
                  <h3>{place.name}</h3>
                  <p>
                    <strong>Type:</strong> {place.type}
                  </p>
                  <p>
                    <strong>Area:</strong> {place.area}
                  </p>
                  <p>
                    <strong>Booking:</strong> {place.booking}
                  </p>
                  <p>
                    <strong>Status:</strong> {place.status}
                  </p>
                  <p>{place.notes}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "services" && (
          <section className="page">
            <h2>Fuel & Services</h2>

            <div className="parking-grid">
              {serviceAreas.map((service) => (
                <div className="parking-card" key={service.id}>
                  <h3>{service.name}</h3>
                  <p>
                    <strong>Road:</strong> {service.road}
                  </p>
                  <p>
                    <strong>Area:</strong> {service.area}
                  </p>
                  <p>
                    <strong>Status:</strong> {service.status}
                  </p>
                  <p>
                    <strong>Facilities:</strong>
                  </p>
                  <p>{service.facilities.join(", ")}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "driver" && (
          <DriverView selectedFleet={selectedFleet} />
        )}

        {activePage !== "dashboard" &&
          activePage !== "driver" &&
          activePage !== "fleet" &&
          activePage !== "depots" &&
          activePage !== "parking" &&
          activePage !== "services" && (
            <section className="page">
              <h2>{activePage.toUpperCase()}</h2>
              <p>This page is ready to build next.</p>
            </section>
          )}
      </main>
    </div>
  );
}

export default App;
