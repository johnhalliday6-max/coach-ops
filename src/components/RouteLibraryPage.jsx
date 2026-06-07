import { useEffect, useMemo, useState } from 'react';
import { defaultRouteLibrary, deleteCustomRoute, loadRouteLibrary, saveCustomRoute } from '../data/routeLibrary';
import { buildVehicleRoute, clearVehicleRoute, pushRouteToDriver, saveActiveRoute } from '../shared/routePlanning';

function makeId(value) {
  return String(value || 'route')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `route-${Date.now()}`;
}

export default function RouteLibraryPage({ selectedFleet, onRouteBuilt, onSelectDashboard }) {
  const [routes, setRoutes] = useState(loadRouteLibrary);
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || '');
  const [status, setStatus] = useState('Select a saved route, assign it to a coach, then push to driver.');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    number: '',
    name: '',
    operator: selectedFleet.operator || 'Go-Ahead Coach Ops',
    category: 'School',
    stopsText: '',
    destination: '',
    notes: '',
  });

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) || routes[0] || null,
    [routes, selectedRouteId],
  );

  useEffect(() => {
    if (!selectedRouteId && routes[0]?.id) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);

  const refreshRoutes = () => setRoutes(loadRouteLibrary());

  const resetForm = () => {
    setForm({
      number: '',
      name: '',
      operator: selectedFleet.operator || 'Go-Ahead Coach Ops',
      category: 'School',
      stopsText: '',
      destination: '',
      notes: '',
    });
  };

  const saveRoute = () => {
    if (!form.number.trim() || !form.name.trim() || !form.destination.trim()) {
      setStatus('Route number, name and destination are required.');
      return;
    }

    const route = {
      id: makeId(`${form.number}-${form.name}`),
      number: form.number.trim(),
      name: form.name.trim(),
      operator: form.operator.trim() || selectedFleet.operator,
      category: form.category.trim() || 'Route',
      stops: form.stopsText
        .split('\n')
        .map((stop) => stop.trim())
        .filter(Boolean),
      destination: form.destination.trim(),
      notes: form.notes.trim(),
    };

    saveCustomRoute(route);
    refreshRoutes();
    setSelectedRouteId(route.id);
    setStatus(`Saved route ${route.number} - ${route.name}.`);
    resetForm();
  };

  const deleteRoute = () => {
    if (!selectedRoute) return;
    if (defaultRouteLibrary.some((route) => route.id === selectedRoute.id)) {
      setStatus('Built-in demo routes cannot be deleted. Create your own live route and delete that instead.');
      return;
    }
    deleteCustomRoute(selectedRoute.id);
    refreshRoutes();
    setSelectedRouteId('');
    setStatus('Route deleted.');
  };

  const plotRoute = async ({ push = false } = {}) => {
    if (!selectedRoute) {
      setStatus('Select a saved route first.');
      return;
    }

    setBusy(true);
    setStatus(`${push ? 'Pushing' : 'Plotting'} ${selectedRoute.number} for ${selectedFleet.fleetNo}...`);
    try {
      await clearVehicleRoute(selectedFleet);
      const built = await buildVehicleRoute(selectedFleet, selectedRoute);
      await saveActiveRoute(built);
      onRouteBuilt?.(built);
      if (push) await pushRouteToDriver(selectedFleet, built);
      setStatus(`${selectedRoute.number} plotted for ${selectedFleet.fleetNo}: ${built.distanceMiles} miles · ${built.durationMinutes} mins${push ? ' · pushed to driver' : ''}.`);
      onSelectDashboard?.();
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Could not plot saved route.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page routes-library-page">
      <div className="routes-library-header">
        <div>
          <h2>Routes Library</h2>
          <p>Premake school runs, rail work, event shuttles and airport jobs. Select one, assign it to a coach, then plot or push it.</p>
        </div>
        <strong>Selected coach: {selectedFleet.fleetNo} / {selectedFleet.reg}</strong>
      </div>

      <div className="routes-library-grid">
        <div className="route-library-list card">
          <h3>Saved Routes</h3>
          {routes.map((route) => (
            <button
              key={route.id}
              type="button"
              className={selectedRoute?.id === route.id ? 'route-library-item active' : 'route-library-item'}
              onClick={() => setSelectedRouteId(route.id)}
            >
              <strong>{route.number}</strong>
              <span>{route.name}</span>
              <small>{route.category} · {route.operator}</small>
            </button>
          ))}
        </div>

        <div className="route-library-detail card">
          <h3>Route Detail</h3>
          {selectedRoute ? (
            <>
              <div className="route-number-badge">{selectedRoute.number}</div>
              <h2>{selectedRoute.name}</h2>
              <p><strong>Operator:</strong> {selectedRoute.operator}</p>
              <p><strong>Type:</strong> {selectedRoute.category}</p>
              {selectedRoute.notes && <p>{selectedRoute.notes}</p>}
              <h4>Stops / pickups</h4>
              <ol className="route-stop-list">
                {(selectedRoute.stops || []).map((stop, index) => <li key={`${stop}-${index}`}>{stop}</li>)}
                <li><strong>{selectedRoute.destination}</strong></li>
              </ol>
              <div className="route-library-actions">
                <button disabled={busy} onClick={() => plotRoute({ push: false })}>🗺 Plot on Office Map</button>
                <button disabled={busy} onClick={() => plotRoute({ push: true })}>📲 Push to Driver</button>
                <button disabled={busy} className="danger-soft" onClick={deleteRoute}>Delete</button>
              </div>
            </>
          ) : <p>No route selected.</p>}
          <p className="route-status">{status}</p>
        </div>

        <div className="route-library-create card">
          <h3>Create Route</h3>
          <label>Route number<input value={form.number} onChange={(e) => setForm((c) => ({ ...c, number: e.target.value }))} placeholder="315" /></label>
          <label>Name<input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Whitby School Run" /></label>
          <label>Operator<input value={form.operator} onChange={(e) => setForm((c) => ({ ...c, operator: e.target.value }))} /></label>
          <label>Type<input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} placeholder="School / Rail / Event" /></label>
          <label>Stops / pickups<textarea value={form.stopsText} onChange={(e) => setForm((c) => ({ ...c, stopsText: e.target.value }))} placeholder={'One stop per line\nSleights\nRuswarp\nWhitby'} /></label>
          <label>Destination<input value={form.destination} onChange={(e) => setForm((c) => ({ ...c, destination: e.target.value }))} placeholder="Caedmon College Whitby" /></label>
          <label>Notes<textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="School run notes, contract details, access instructions..." /></label>
          <button disabled={busy} onClick={saveRoute}>Save Route</button>
        </div>
      </div>
    </section>
  );
}
