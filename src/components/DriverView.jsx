import { useState } from "react";
import RouteMap from "./RouteMap";
import DriverIntel from "./DriverIntel";

const GOOGLE_NAV_URL =
  "https://www.google.com/maps/dir/?api=1&origin=York&destination=London%20Victoria&waypoints=Peterborough%20Services&travelmode=driving";

export default function DriverView({ selectedFleet }) {
  const [passengers, setPassengers] = useState(34);
  const [message, setMessage] = useState("");
  const [lastAction, setLastAction] = useState("Driver screen ready");

  const notify = (text) => {
    setLastAction(text);
    alert(text);
  };

  return (
    <main className="driver-only-page">
      <header className="driver-only-header">
        <div>
          <h1>Coach Ops Driver</h1>
          <p>
            {selectedFleet.fleetNo} · York → Peterborough Services → London
            Victoria
          </p>
        </div>
        <span>LIVE TEST</span>
      </header>

      <section className="driver-navigation-card">
        <div>
          <strong>Tonight's Navigation</strong>
          <p>
            Use Google Maps for turn-by-turn directions. Keep this screen open
            for National Highways live road intel.
          </p>
        </div>
        <button
          onClick={() => {
            window.location.href = GOOGLE_NAV_URL;
          }}
        >
          🧭 Start Google Navigation
        </button>
      </section>

      <section className="driver-only-grid">
        <aside className="driver-only-left">
          <article className="driver-card">
            <h3>Journey</h3>
            <p>
              <strong>Booking:</strong> P12440/20519
            </p>
            <p>
              <strong>Vehicle:</strong> {selectedFleet.fleetNo}
            </p>
            <p>
              <strong>Depot:</strong> {selectedFleet.depot}
            </p>
            <p>
              <strong>Next stop:</strong> Peterborough Services
            </p>
            <p>
              <strong>Destination:</strong> London Victoria
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
              <div>⬜ London Victoria</div>
            </div>
          </article>
        </aside>

        <section className="driver-only-map">
          <div className="driver-map-title">
            <h2>Live Route Map</h2>
            <span>Road closures plotted from National Highways</span>
          </div>
          <RouteMap height="calc(100vh - 285px)" />
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
