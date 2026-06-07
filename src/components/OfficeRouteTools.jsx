import { useEffect, useState } from "react";
import PlaceSearchBox from "./PlaceSearchBox";

import { buildVehicleRoute, clearVehicleRoute, pushRouteToDriver, saveActiveRoute } from '../shared/routePlanning';

export default function OfficeRouteTools({ selectedFleet, onRouteBuilt, onRouteCleared }) {
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


  const setDestinationAndResetRoute = (value) => {
    setDestination(value);
    setRoute(null);
    if (value.trim()) setStatus("Destination changed. Calculate or Push to build the new route.");
  };

  const setStopInputAndResetRoute = (value) => {
    setStopInput(value);
  };

  const addStop = () => {
    const value = stopInput.trim();
    if (!value) return;
    setStops((current) => [...current, value]);
    setRoute(null);
    setStopInput("");
    setStatus("Stop changed. Calculate or Push to build the new route.");
  };

  const clearRoute = async () => {
    setRoute(null);
    onRouteCleared?.();
    setDestination("");
    setStops([]);
    setStopInput("");
    setStatus("Route cleared locally.");
    try {
      await clearVehicleRoute(selectedFleet);
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
      await clearVehicleRoute(selectedFleet);
      const built = await buildVehicleRoute(selectedFleet, { destination, stops });
      await saveActiveRoute(built);

      setRoute(built);
      onRouteBuilt?.(built);
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
      await saveActiveRoute(built);
      await pushRouteToDriver(selectedFleet, built);
      onRouteBuilt?.(built);
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
        setValue={setDestinationAndResetRoute}
        placeholder="Scarborough Station, Big Ben, Manchester Airport T2..."
      />
      <PlaceSearchBox
        compact
        label="Stop / services"
        value={stopInput}
        setValue={setStopInputAndResetRoute}
        placeholder="Birch Services, Wetherby Services..."
      />

      <button type="button" onClick={addStop} disabled={busy}>+ Add Stop</button>
      {stops.length > 0 && (
        <div className="route-stop-pills office-stops">
          {stops.map((stop, index) => (
            <span key={`${stop}-${index}`}>{stop}<button onClick={() => { setStops((current) => current.filter((_, i) => i !== index)); setRoute(null); setStatus("Stop removed. Calculate or Push to build the new route."); }}>×</button></span>
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
