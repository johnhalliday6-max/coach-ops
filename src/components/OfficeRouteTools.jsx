import { useEffect, useState } from "react";
import PlaceSearchBox from "./PlaceSearchBox";

const DEPOT_STARTS = {
  Whitby: { lat: 54.47587, lng: -0.62705 },
  Carnaby: { lat: 54.0845, lng: -0.2478 },
  "Stockton-on-Tees": { lat: 54.5617, lng: -1.3216 },
  "Leeming Bar": { lat: 54.3054, lng: -1.5588 },
  Cleckheaton: { lat: 53.724, lng: -1.713 },
};

async function getVehicleStart(vehicle) {
  try {
    const trackingResponse = await fetch(`/api/tracking?vehicle=${encodeURIComponent(vehicle.fleetNo)}`);
    const trackingData = await trackingResponse.json();
    const live = trackingData?.vehicle;
    if (live?.lat && live?.lng) return { lat: live.lat, lng: live.lng, label: "Live vehicle GPS" };
  } catch (error) {
    console.warn("Could not fetch tracking for route start", error);
  }

  const depotStart = DEPOT_STARTS[vehicle.depot] || DEPOT_STARTS.Whitby;
  return { ...depotStart, label: `${vehicle.depot || "Depot"} fallback start` };
}

export default function OfficeRouteTools({ selectedFleet }) {
  const [destination, setDestination] = useState("");
  const [stopInput, setStopInput] = useState("");
  const [stops, setStops] = useState([]);
  const [status, setStatus] = useState("Build a route, then push it to the driver.");
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Vehicle-specific state. Prevent one coach's route being pushed to another.
    setDestination("");
    setStopInput("");
    setStops([]);
    setRoute(null);
    setStatus(`Build a route, then push it to ${selectedFleet.fleetNo} / ${selectedFleet.reg}.`);
  }, [selectedFleet.fleetNo, selectedFleet.reg]);

  const clearServerVehicleRoute = async () => {
    await Promise.allSettled([
      fetch(`/api/routes?vehicle=${encodeURIComponent(selectedFleet.fleetNo)}`, { method: "DELETE" }),
      fetch(`/api/route-pushes?vehicle=${encodeURIComponent(selectedFleet.fleetNo)}`, { method: "DELETE" }),
    ]);
  };

  const addStop = () => {
    const value = stopInput.trim();
    if (!value) return;
    setStops((current) => [...current, value]);
    setStopInput("");
  };

  const clearRoute = async () => {
    setRoute(null);
    setDestination("");
    setStops([]);
    setStopInput("");
    setStatus("Route cleared locally.");
    try {
      await clearServerVehicleRoute();
    } catch (error) {
      console.warn("Could not clear server route", error);
    }
  };

  const buildRoute = async () => {
    if (!destination.trim()) {
      setStatus("Enter a destination first.");
      return null;
    }

    setBusy(true);
    setStatus(`Building route for ${selectedFleet.fleetNo} from live vehicle/depot start...`);
    try {
      await clearServerVehicleRoute();
      const start = await getVehicleStart(selectedFleet);
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: start.lat,
          startLng: start.lng,
          destination,
          stops,
          height: selectedFleet.height,
          width: selectedFleet.width,
          length: selectedFleet.length,
          weight: selectedFleet.weight,
        }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setStatus(data?.error || "Route failed.");
        return null;
      }

      const built = {
        ...data.route,
        fleetNo: selectedFleet.fleetNo,
        reg: selectedFleet.reg,
        destination,
        stops,
        waypoint: stops.join(" → "),
        startLabel: start.label,
        updatedAt: new Date().toISOString(),
      };

      await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built),
      });

      setRoute(built);
      setStatus(`Route ready: ${built.distanceMiles} miles · ${built.durationMinutes} mins · ${built.engine}`);
      return built;
    } catch (error) {
      console.error(error);
      setStatus("Route build failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pushRoute = async () => {
    const built = route || (await buildRoute());
    if (!built) return;

    setBusy(true);
    setStatus(`Pushing route to ${selectedFleet.fleetNo} / ${selectedFleet.reg}...`);
    try {
      await fetch(`/api/route-pushes?vehicle=${encodeURIComponent(selectedFleet.fleetNo)}`, { method: "DELETE" }).catch(() => {});
      await fetch("/api/route-pushes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetNo: selectedFleet.fleetNo,
          reg: selectedFleet.reg,
          route: built,
          note: `Control pushed route to ${built.destination}`,
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
          message: `New route available: ${stops.length ? `${stops.join(" → ")} → ` : ""}${destination}`,
        }),
      });
      setStatus(`Route pushed to ${selectedFleet.fleetNo} / ${selectedFleet.reg}.`);
    } catch (error) {
      console.error(error);
      setStatus("Route push failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="office-route-tools">
      <h3>Route Tools</h3>
      <p className="tool-hint">Build and push a real route to {selectedFleet.fleetNo} / {selectedFleet.reg}.</p>

      <PlaceSearchBox
        compact
        label="Destination"
        value={destination}
        setValue={setDestination}
        placeholder="Scarborough Station, Big Ben, Manchester Airport T2..."
      />
      <PlaceSearchBox
        compact
        label="Stop / services"
        value={stopInput}
        setValue={setStopInput}
        placeholder="Birch Services, Wetherby Services..."
      />

      <button type="button" onClick={addStop} disabled={busy}>+ Add Stop</button>
      {stops.length > 0 && (
        <div className="route-stop-pills office-stops">
          {stops.map((stop, index) => (
            <span key={`${stop}-${index}`}>{stop}<button onClick={() => setStops((current) => current.filter((_, i) => i !== index))}>×</button></span>
          ))}
        </div>
      )}

      <div className="route-tool-grid">
        <button type="button" onClick={buildRoute} disabled={busy}>🧭 Calculate</button>
        <button type="button" onClick={pushRoute} disabled={busy}>📲 Push</button>
        <button type="button" onClick={clearRoute} disabled={busy}>🗑 Clear</button>
      </div>

      <p className="route-status">{status}</p>

      <h3>Vehicle Check</h3>
      <p>✅ Height {selectedFleet.height}</p>
      <p>✅ Width {selectedFleet.width}</p>
      <p>✅ Length {selectedFleet.length}</p>
      <p>✅ Weight {selectedFleet.weight}</p>
    </div>
  );
}
