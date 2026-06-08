import { useEffect, useRef, useState } from "react";
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
import RouteLibraryPage from "./components/RouteLibraryPage";
import TrafficLive from "./components/TrafficLive";

const PROTECTED_DEVELOPER_STAFF_ID = "1600026";

const DEFAULT_OFFICE_STAFF = [
  { staffId: PROTECTED_DEVELOPER_STAFF_ID, name: "John Halliday", companies: ["All"], access: "Developer", protected: true },
  { staffId: "06032013", name: "Anna Bonnard-Halliday", companies: ["Esk Valley Coaches"], access: "Controller" },
];

function normaliseOfficeStaff(staffList) {
  const list = Array.isArray(staffList) ? staffList : DEFAULT_OFFICE_STAFF;
  const withoutDuplicateDeveloper = list.filter((staff) => String(staff.staffId) !== PROTECTED_DEVELOPER_STAFF_ID);
  return [DEFAULT_OFFICE_STAFF[0], ...withoutDuplicateDeveloper];
}

function isDeveloper(profile) {
  return String(profile?.staffId) === PROTECTED_DEVELOPER_STAFF_ID || profile?.access === "Developer";
}

function canManage(profile) {
  return isDeveloper(profile) || profile?.access === "Admin" || profile?.access === "Supervisor";
}

function canRemove(profile) {
  return isDeveloper(profile) || profile?.access === "Admin";
}

const emptyVehicleForm = { fleetNo: "", reg: "", operator: "", category: "", depot: "", type: "Coach", height: "4.20 m", width: "2.55 m", length: "12.80 m", weight: "19,000 kg", status: "Available" };
const emptyStaffForm = { staffId: "", name: "", companies: "Esk Valley Coaches", access: "Controller" };

function App() {
  const [managedFleet, setManagedFleet] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("coachOpsManagedFleet") || "null") || fleetData;
    } catch {
      return fleetData;
    }
  });
  const [officeStaff, setOfficeStaff] = useState(() => {
    try {
      return normaliseOfficeStaff(JSON.parse(window.localStorage.getItem("coachOpsOfficeStaff") || "null") || DEFAULT_OFFICE_STAFF);
    } catch {
      return normaliseOfficeStaff(DEFAULT_OFFICE_STAFF);
    }
  });
  const [selectedFleet, setSelectedFleet] = useState(() => managedFleet[0] || fleetData[0]);
  const [search, setSearch] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("All");
  const isDriverOnly =
    window.location.pathname === "/driver" ||
    new URLSearchParams(window.location.search).get("mode") === "driver";
  const [activePage, setActivePage] = useState(
    isDriverOnly ? "driver" : "dashboard",
  );
  const [officeLoginCode, setOfficeLoginCode] = useState("");
  const [pendingOfficeProfile, setPendingOfficeProfile] = useState(null);
  const [pendingOfficeCompany, setPendingOfficeCompany] = useState("");
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [officeLoginError, setOfficeLoginError] = useState("");
  const [officeProfile, setOfficeProfile] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("coachOpsOfficeProfile") || "null");
    } catch {
      return null;
    }
  });
  const [officeCompany, setOfficeCompany] = useState(() => window.localStorage.getItem("coachOpsOfficeCompany") || "All");
  const [liveVehicles, setLiveVehicles] = useState([]);
  const [officeRequests, setOfficeRequests] = useState([]);
  const [activeOfficeRoute, setActiveOfficeRoute] = useState(null);
  const [officeRouteCache, setOfficeRouteCache] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("coachOpsOfficeRouteCache") || "{}");
    } catch {
      return {};
    }
  });
  const officeRouteCacheRef = useRef(officeRouteCache);

  const saveManagedFleet = (nextFleet) => {
    setManagedFleet(nextFleet);
    window.localStorage.setItem("coachOpsManagedFleet", JSON.stringify(nextFleet));
  };

  const saveOfficeStaff = (nextStaff) => {
    const normalised = normaliseOfficeStaff(nextStaff);
    setOfficeStaff(normalised);
    window.localStorage.setItem("coachOpsOfficeStaff", JSON.stringify(normalised));
  };

  const saveOfficeRouteCache = (nextCache) => {
    officeRouteCacheRef.current = nextCache;
    setOfficeRouteCache(nextCache);
    try {
      window.localStorage.setItem("coachOpsOfficeRouteCache", JSON.stringify(nextCache));
    } catch {
      // localStorage can fail in private mode; in-memory cache still works.
    }
  };

  const vehicleRouteKeys = (vehicle) => {
    const keys = [];
    const fleet = String(vehicle?.fleetNo || "").trim().toUpperCase();
    const reg = String(vehicle?.reg || "").trim().toUpperCase();
    if (fleet) keys.push(fleet);
    if (reg && reg !== fleet) keys.push(reg);
    return keys;
  };

  const cacheRouteForVehicle = (route, fallbackVehicle = selectedFleet) => {
    if (!route) return;
    const next = { ...officeRouteCacheRef.current };
    const keys = new Set([
      ...vehicleRouteKeys(fallbackVehicle),
      ...vehicleRouteKeys(route),
      String(route?.vehicle || "").trim().toUpperCase(),
    ].filter(Boolean));
    keys.forEach((key) => { next[key] = route; });
    saveOfficeRouteCache(next);
  };

  const isRecentTracking = (vehicle) => {
    if (!vehicle?.updatedAt) return false;
    const ageMs = Date.now() - new Date(vehicle.updatedAt).getTime();
    return Number.isFinite(ageMs) && ageMs < 2 * 60 * 1000;
  };

  const getLiveVehicle = (vehicle) => {
    const keys = vehicleRouteKeys(vehicle);
    return liveVehicles.find((live) => keys.includes(String(live?.fleetNo || "").trim().toUpperCase()) || keys.includes(String(live?.reg || "").trim().toUpperCase()));
  };

  const getVehicleRoute = (vehicle) => {
    return vehicleRouteKeys(vehicle).map((key) => officeRouteCacheRef.current[key]).find(Boolean) || null;
  };

  const getVehicleOfficeStatus = (vehicle) => {
    const live = getLiveVehicle(vehicle);
    if (isRecentTracking(live)) return { label: "Tracking", className: "tracking", icon: "📡" };
    if (getVehicleRoute(vehicle)) return { label: "Route Set", className: "route-set", icon: "🗺️" };
    return { label: "Available", className: "available", icon: "⚪" };
  };

  const companyForVehicle = (vehicle) => vehicle?.category || vehicle?.operator || "Unassigned";

  const officeCanSeeCompany = (company) => {
    const allowed = officeProfile?.allowedCompanies || [];
    return allowed.includes("All") || allowed.includes(company);
  };

  const saveNewVehicle = () => {
    const fleetNo = String(vehicleForm.fleetNo || "").trim();
    const reg = String(vehicleForm.reg || "").trim();
    if (!fleetNo || !reg) {
      alert("Fleet number and registration are required");
      return;
    }
    const nextVehicle = {
      ...emptyVehicleForm,
      ...vehicleForm,
      fleetNo,
      reg,
      operator: vehicleForm.operator || vehicleForm.category || "Unassigned",
      category: vehicleForm.category || vehicleForm.operator || "Unassigned",
      depot: vehicleForm.depot || "Unassigned",
    };
    const nextFleet = managedFleet.filter((vehicle) => String(vehicle.fleetNo) !== fleetNo);
    saveManagedFleet([...nextFleet, nextVehicle]);
    setSelectedFleet(nextVehicle);
    setVehicleForm(emptyVehicleForm);
  };

  const removeVehicle = (fleetNo) => {
    const nextFleet = managedFleet.filter((vehicle) => String(vehicle.fleetNo) !== String(fleetNo));
    saveManagedFleet(nextFleet);
    if (String(selectedFleet?.fleetNo) === String(fleetNo)) setSelectedFleet(nextFleet[0] || fleetData[0]);
  };

  const saveNewStaff = () => {
    const staffId = String(staffForm.staffId || "").trim();
    const name = String(staffForm.name || "").trim();
    if (!staffId || !name) {
      alert("Staff ID and name are required");
      return;
    }
    const companies = String(staffForm.companies || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const nextStaffMember = { staffId, name, companies: companies.length ? companies : ["Esk Valley Coaches"], access: staffForm.access || "Controller", protected: staffId === PROTECTED_DEVELOPER_STAFF_ID };
    saveOfficeStaff([...officeStaff.filter((staff) => String(staff.staffId) !== staffId), nextStaffMember]);
    setStaffForm(emptyStaffForm);
  };

  const removeStaff = (staffId) => {
    if (String(staffId) === PROTECTED_DEVELOPER_STAFF_ID) {
      alert("Developer account cannot be removed");
      return;
    }
    saveOfficeStaff(officeStaff.filter((staff) => String(staff.staffId) !== String(staffId)));
  };

  const loginOffice = () => {
    const code = String(officeLoginCode || "").trim();
    const staff = officeStaff.find((item) => String(item.staffId) === code);
    if (!staff) {
      setOfficeLoginError("Staff ID not recognised");
      return;
    }
    const profile = { name: staff.name, staffId: staff.staffId, access: staff.staffId === PROTECTED_DEVELOPER_STAFF_ID ? "Developer" : staff.access, allowedCompanies: staff.companies || [] };
    setOfficeLoginError("");
    setPendingOfficeProfile(profile);
    const firstCompany = profile.allowedCompanies.includes("All") ? "All" : profile.allowedCompanies[0];
    setPendingOfficeCompany(firstCompany || "All");
  };

  const enterOfficeControlRoom = () => {
    if (!pendingOfficeProfile) return;
    const company = pendingOfficeCompany || (pendingOfficeProfile.allowedCompanies.includes("All") ? "All" : pendingOfficeProfile.allowedCompanies[0]);
    setOfficeProfile(pendingOfficeProfile);
    setOfficeCompany(company);
    setOperatorFilter(company);
    window.localStorage.setItem("coachOpsOfficeProfile", JSON.stringify(pendingOfficeProfile));
    window.localStorage.setItem("coachOpsOfficeCompany", company);
    setPendingOfficeProfile(null);
    setOfficeLoginCode("");
  };

  const logoutOffice = () => {
    setOfficeProfile(null);
    setPendingOfficeProfile(null);
    setOfficeLoginCode("");
    window.localStorage.removeItem("coachOpsOfficeProfile");
    window.localStorage.removeItem("coachOpsOfficeCompany");
  };

  useEffect(() => {
    if (isDriverOnly) return undefined;

    let cancelled = false;

    const loadRequests = () => {
      fetch("/api/requests")
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) {
            const visibleRequests = (data.requests || []).filter((request) => {
              if (!officeProfile) return false;
              if ((officeProfile.allowedCompanies || []).includes("All")) {
                return officeCompany === "All" || request.operator === officeCompany || request.company === officeCompany || request.category === officeCompany;
              }
              return (officeProfile.allowedCompanies || []).some((company) =>
                request.operator === company || request.company === company || request.category === company
              );
            });
            setOfficeRequests(visibleRequests.slice(0, 8));
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
  }, [isDriverOnly, officeProfile, officeCompany]);

  useEffect(() => {
    if (isDriverOnly || !officeProfile) return undefined;

    let cancelled = false;
    const loadTracking = () => {
      fetch(`/api/tracking?_=${Date.now()}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.ok) setLiveVehicles(data.vehicles || []);
        })
        .catch((err) => console.error("Office tracking fetch failed", err));
    };

    loadTracking();
    const timer = window.setInterval(loadTracking, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isDriverOnly, officeProfile]);

  useEffect(() => {
    if (isDriverOnly || !selectedFleet?.fleetNo) return undefined;

    let cancelled = false;
    const selectedKeys = vehicleRouteKeys(selectedFleet);
    const selectedVehicleId = selectedKeys[0];

    const cachedRoute = selectedKeys.map((key) => officeRouteCacheRef.current[key]).find(Boolean);
    if (cachedRoute) setActiveOfficeRoute(cachedRoute);

    const loadActiveRoutes = async () => {
      const stamp = Date.now();
      try {
        // Load the whole active-route list first. This prevents the office map
        // dropping another coach's route when the controller switches vehicles.
        const allResponse = await fetch(`/api/routes?_=${stamp}`, { cache: "no-store" });
        const allData = await allResponse.json();
        if (cancelled || !allData?.ok) return;

        const nextCache = { ...officeRouteCacheRef.current };
        (allData.routes || []).forEach((route) => {
          const routeKeys = vehicleRouteKeys(route);
          const routeVehicle = String(route?.vehicle || "").trim().toUpperCase();
          if (routeVehicle) routeKeys.push(routeVehicle);
          routeKeys.filter(Boolean).forEach((key) => { nextCache[key] = route; });
        });
        saveOfficeRouteCache(nextCache);

        let matchingRoute = selectedKeys.map((key) => nextCache[key]).find(Boolean) || null;

        // If the all-list missed it, check the selected coach directly. Do not
        // clear the map when the direct lookup says null; a Vercel/Supabase read
        // can briefly lag and old route must remain until explicit Clear.
        if (!matchingRoute && selectedVehicleId) {
          const response = await fetch(`/api/routes?vehicle=${encodeURIComponent(selectedVehicleId)}&_=${stamp}`, {
            cache: "no-store",
          });
          const data = await response.json();
          if (!cancelled && data?.ok && data.route) {
            matchingRoute = data.route;
            cacheRouteForVehicle(data.route, selectedFleet);
          }
        }

        if (!cancelled && matchingRoute) setActiveOfficeRoute(matchingRoute);
      } catch (err) {
        console.error("Office active route fetch failed", err);
      }
    };

    loadActiveRoutes();
    const timer = window.setInterval(loadActiveRoutes, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isDriverOnly, selectedFleet?.fleetNo, selectedFleet?.reg]);

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

  const allOperatorCategories = Array.from(new Set(managedFleet.map((vehicle) => companyForVehicle(vehicle)))).sort();
  const allowedCompanyOptions = officeProfile?.allowedCompanies?.includes("All")
    ? ["All", ...allOperatorCategories]
    : (officeProfile?.allowedCompanies || []);

  const filteredFleet = managedFleet.filter((vehicle) => {
    const text =
      `${vehicle.fleetNo} ${vehicle.reg} ${vehicle.operator} ${vehicle.category || ""} ${vehicle.depot}`.toLowerCase();
    const company = companyForVehicle(vehicle);
    const companyMatch = officeCanSeeCompany(company) && (officeCompany === "All" || company === officeCompany);
    return companyMatch && text.includes(search.toLowerCase());
  });

  const fleetStats = {
    total: filteredFleet.length,
    tracking: filteredFleet.filter((v) => getVehicleOfficeStatus(v).className === "tracking").length,
    routeSet: filteredFleet.filter((v) => getVehicleOfficeStatus(v).className === "route-set").length,
    requests: officeRequests.length,
  };

  if (isDriverOnly) {
    return <DriverView selectedFleet={selectedFleet} />;
  }

  if (!officeProfile) {
    const loginCompanyOptions = pendingOfficeProfile?.allowedCompanies?.includes("All")
      ? ["All", ...allOperatorCategories]
      : (pendingOfficeProfile?.allowedCompanies || []);

    return (
      <main className="office-login-page">
        <section className="office-login-card">
          <img src={logo} alt="Go Ahead" />
          <h1>Coach Ops Control</h1>
          {!pendingOfficeProfile ? (
            <>
              <p>Enter your staff ID to open the control room.</p>
              <input
                value={officeLoginCode}
                onChange={(event) => setOfficeLoginCode(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") loginOffice(); }}
                placeholder="Staff ID"
                inputMode="numeric"
                type="password"
              />
              {officeLoginError && <div className="office-login-error">{officeLoginError}</div>}
              <button onClick={loginOffice}>Continue</button>
            </>
          ) : (
            <>
              <p>Select which company desk you are covering. You will only see that company’s vehicles and driver requests.</p>
              <select className="office-login-select" value={pendingOfficeCompany} onChange={(event) => setPendingOfficeCompany(event.target.value)}>
                {loginCompanyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
              </select>
              <button onClick={enterOfficeControlRoom}>Open Control Room</button>
              <button className="secondary-login-button" onClick={() => setPendingOfficeProfile(null)}>Back</button>
            </>
          )}
        </section>
      </main>
    );
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
          className={activePage === "management" ? "nav active" : "nav"}
          onClick={() => setActivePage("management")}
        >
          Management
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
          <div className="topbar-actions">
            <span>Control: {officeProfile.name}</span>
            <button onClick={() => setActivePage("incidents")}>Alerts {fleetStats.requests}</button>
            <button onClick={() => setActivePage("drivers")}>Messages {officeRequests.length}</button>
            <button className="ghost-button" onClick={logoutOffice}>Logout</button>
          </div>
        </header>

        <section className="statusbar">
          <strong>Fleet: {selectedFleet.fleetNo}</strong>
          <strong>Depot: {selectedFleet.depot}</strong>
          <strong>Route: {activeOfficeRoute?.destination || "No active route"}</strong>
          <span className={`office-status-text ${getVehicleOfficeStatus(selectedFleet).className}`}>{getVehicleOfficeStatus(selectedFleet).label}</span>
        </section>

        <section className="statsbar">
          <div>🚍 Visible: {fleetStats.total}</div>
          <div>📡 Tracking: {fleetStats.tracking}</div>
          <div>🗺️ Routes Set: {fleetStats.routeSet}</div>
          <div>📨 Requests: {fleetStats.requests}</div>
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
                  value={officeCompany}
                  onChange={(event) => {
                    setOfficeCompany(event.target.value);
                    setOperatorFilter(event.target.value);
                    window.localStorage.setItem("coachOpsOfficeCompany", event.target.value);
                  }}
                >
                  {allowedCompanyOptions.map((category) => (
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
                      {getVehicleOfficeStatus(vehicle).icon} {vehicle.fleetNo}
                    </strong>
                    <span className={`fleet-status-pill ${getVehicleOfficeStatus(vehicle).className}`}>{getVehicleOfficeStatus(vehicle).label}</span>
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
                <RouteMap fleetNo={selectedFleet.fleetNo} reg={selectedFleet.reg} routeOverride={activeOfficeRoute} />
              </div>

              <div className="tools-panel">
                <OfficeRouteTools
                  selectedFleet={selectedFleet}
                  onRouteBuilt={(route) => {
                    cacheRouteForVehicle(route, selectedFleet);
                    setActiveOfficeRoute(route);
                  }}
                  onRouteCleared={() => {
                    const next = { ...officeRouteCacheRef.current };
                    vehicleRouteKeys(selectedFleet).forEach((key) => delete next[key]);
                    saveOfficeRouteCache(next);
                    setActiveOfficeRoute(null);
                  }}
                />
              </div>
            </section>

            <TrafficLive selectedFleet={selectedFleet} activeRoute={activeOfficeRoute} />
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
              {managedFleet.filter((vehicle) => officeCanSeeCompany(companyForVehicle(vehicle))).map((vehicle) => (
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

        {activePage === "management" && (
          <section className="page management-page">
            <h2>Office Management</h2>
            <p>Add vehicles and staff access. This is stored in the browser for this prototype; later we will move it into Supabase.</p>

            <div className="management-grid">
              <div className="management-card">
                <h3>Add / Update Vehicle</h3>
                <div className="form-grid">
                  <input placeholder="Fleet number" value={vehicleForm.fleetNo} onChange={(e) => setVehicleForm({ ...vehicleForm, fleetNo: e.target.value })} />
                  <input placeholder="Registration" value={vehicleForm.reg} onChange={(e) => setVehicleForm({ ...vehicleForm, reg: e.target.value })} />
                  <select value={vehicleForm.category} onChange={(e) => setVehicleForm({ ...vehicleForm, category: e.target.value, operator: e.target.value })}>
                    <option value="">Company</option>
                    {allOperatorCategories.filter((company) => company !== "All").map((company) => <option key={company} value={company}>{company}</option>)}
                    <option value="Esk Valley Coaches">Esk Valley Coaches</option>
                    <option value="Fourway / Go West Yorkshire">Fourway / Go West Yorkshire</option>
                    <option value="Procters Coaches">Procters Coaches</option>
                    <option value="Compass Royston">Compass Royston</option>
                  </select>
                  <input placeholder="Depot" value={vehicleForm.depot} onChange={(e) => setVehicleForm({ ...vehicleForm, depot: e.target.value })} />
                  <input placeholder="Type" value={vehicleForm.type} onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })} />
                  <input placeholder="Height" value={vehicleForm.height} onChange={(e) => setVehicleForm({ ...vehicleForm, height: e.target.value })} />
                  <input placeholder="Width" value={vehicleForm.width} onChange={(e) => setVehicleForm({ ...vehicleForm, width: e.target.value })} />
                  <input placeholder="Length" value={vehicleForm.length} onChange={(e) => setVehicleForm({ ...vehicleForm, length: e.target.value })} />
                  <input placeholder="Weight" value={vehicleForm.weight} onChange={(e) => setVehicleForm({ ...vehicleForm, weight: e.target.value })} />
                </div>
                <button onClick={saveNewVehicle}>Save Vehicle</button>
              </div>

              <div className="management-card">
                <h3>Add / Update Staff Access</h3>
                <div className="form-grid">
                  <input placeholder="Employee / Staff ID" value={staffForm.staffId} onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value })} />
                  <input placeholder="Name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                  <input placeholder="Companies, comma separated" value={staffForm.companies} onChange={(e) => setStaffForm({ ...staffForm, companies: e.target.value })} />
                  <select value={staffForm.access} onChange={(e) => setStaffForm({ ...staffForm, access: e.target.value })}>
                    <option>Controller</option>
                    <option>Supervisor</option>
                    <option>Admin</option>
                    <option>Developer</option>
                    <option>Read Only</option>
                  </select>
                </div>
                <button onClick={saveNewStaff}>Save Staff</button>
              </div>
            </div>

            <h3>Vehicles</h3>
            <div className="management-list">
              {managedFleet.filter((vehicle) => officeCanSeeCompany(companyForVehicle(vehicle))).map((vehicle) => (
                <div className="management-row" key={vehicle.fleetNo}>
                  <strong>{vehicle.fleetNo} · {vehicle.reg}</strong>
                  <span>{companyForVehicle(vehicle)} · {vehicle.depot}</span>
                  {canRemove(officeProfile) && <button onClick={() => removeVehicle(vehicle.fleetNo)}>Remove</button>}
                </div>
              ))}
            </div>

            <h3>Staff Access</h3>
            <div className="management-list">
              {officeStaff.map((staff) => (
                <div className="management-row" key={staff.staffId}>
                  <strong>{staff.name}</strong>
                  <span>{staff.access}{staff.protected ? " · Protected" : ""} · {(staff.companies || []).join(", ")}</span>
                  {canRemove(officeProfile) && String(staff.staffId) !== PROTECTED_DEVELOPER_STAFF_ID && <button onClick={() => removeStaff(staff.staffId)}>Remove</button>}
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "routes" && (
          <RouteLibraryPage
            selectedFleet={selectedFleet}
            onRouteBuilt={(route) => {
              const vehicleId = String(route?.fleetNo || selectedFleet.fleetNo || "").trim().toUpperCase();
              officeRouteCacheRef.current = { ...officeRouteCacheRef.current, [vehicleId]: route };
              setOfficeRouteCache(officeRouteCacheRef.current);
              setActiveOfficeRoute(route);
            }}
            onSelectDashboard={() => setActivePage("dashboard")}
          />
        )}

        {activePage !== "dashboard" &&
          activePage !== "driver" &&
          activePage !== "fleet" &&
          activePage !== "depots" &&
          activePage !== "parking" &&
          activePage !== "services" &&
          activePage !== "routes" &&
          activePage !== "management" && (
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
