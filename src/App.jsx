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
import OfficeRouteTools from "./components/OfficeRouteTools";

function App() {
  const [selectedFleet, setSelectedFleet] = useState(fleetData[0]);
  const [search, setSearch] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("All");
  const isDriverOnly =
    window.location.pathname === "/driver" ||
    new URLSearchParams(window.location.search).get("mode") === "driver";
  const [activePage, setActivePage] = useState(
    isDriverOnly ? "driver" : "dashboard",
  );
  const [officeRequests, setOfficeRequests] = useState([]);
  const [activeOfficeRoute, setActiveOfficeRoute] = useState(null);

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

  useEffect(() => {
    if (isDriverOnly || !selectedFleet?.fleetNo) return undefined;

    let cancelled = false;
    const loadActiveRoute = () => {
      fetch(`/api/routes?vehicle=${encodeURIComponent(selectedFleet.fleetNo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) setActiveOfficeRoute(data.route || null);
        })
        .catch((err) => console.error("Office active route fetch failed", err));
    };

    loadActiveRoute();
    const timer = window.setInterval(loadActiveRoute, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isDriverOnly, selectedFleet?.fleetNo]);

  const sendOfficeRoutePush = async () => {
    try {
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
          message: "Control has reviewed your route. Continue on the latest route shown on your map.",
        }),
      });
      alert(`Route push sent to ${selectedFleet.fleetNo} / ${selectedFleet.reg}`);
    } catch (error) {
      console.error(error);
      alert("Could not send route push");
    }
  };



  const closeOfficeRequest = async (id) => {
    try {
      await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "closed" }),
      });
      setOfficeRequests((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      console.error(error);
      alert("Could not close request");
    }
  };

  const operatorCategories = ["All", ...Array.from(new Set(fleetData.map((vehicle) => vehicle.category || vehicle.operator))).sort()];

  const filteredFleet = fleetData.filter((vehicle) => {
    const text =
      `${vehicle.fleetNo} ${vehicle.reg} ${vehicle.operator} ${vehicle.category || ""} ${vehicle.depot} ${vehicle.status}`.toLowerCase();
    const operatorMatch = operatorFilter === "All" || (vehicle.category || vehicle.operator) === operatorFilter;
    return operatorMatch && text.includes(search.toLowerCase());
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
          <strong>Route: {activeOfficeRoute?.destination || "No active route"}</strong>
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
                  <button className="office-close-request" onClick={() => closeOfficeRequest(request.id)}>Dealt with</button>
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
                <select
                  className="operator-filter"
                  value={operatorFilter}
                  onChange={(event) => setOperatorFilter(event.target.value)}
                >
                  {operatorCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>

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

              <div className="tools-panel">
                <OfficeRouteTools selectedFleet={selectedFleet} />
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
                <h3>Office Control</h3>
                <p><strong>Selected:</strong> {selectedFleet.fleetNo} / {selectedFleet.reg}</p>
                <p><strong>Operator:</strong> {selectedFleet.operator}</p>
                <p><strong>Depot:</strong> {selectedFleet.depot}</p>
                <p>Use the Route Tools panel to calculate, clear or push a route.</p>
              </div>

              <div className="card route-summary">
                <h3>Coach Safety Layer</h3>
                <p>✅ Vehicle dimensions attached</p>
                <p>✅ Valhalla truck/coach profile used</p>
                <p>✅ National Highways overlay live</p>
                <p>⚠ Low bridge/weight restriction database pending</p>
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
                    <strong>Category:</strong> {vehicle.category || vehicle.operator}
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
