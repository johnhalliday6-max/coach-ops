import { useEffect, useMemo, useState } from 'react';
import { deleteCustomRoute, loadRouteLibrary, resetStarterRoutes, saveCustomRoute } from '../data/routeLibrary';
import { buildVehicleRoute, clearVehicleRoute, pushRouteToDriver, saveActiveRoute } from '../shared/routePlanning';
import PlaceSearchBox from './PlaceSearchBox';

function makeId(value) {
  return String(value || 'route')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `route-${Date.now()}`;
}

function blankForm(selectedFleet) {
  return {
    id: '',
    number: '',
    name: '',
    operator: selectedFleet?.operator || 'Go-Ahead Coach Ops',
    category: 'School',
    stopsText: '',
    destination: '',
    notes: '',
  };
}

export default function RouteLibraryPage({ selectedFleet, onRouteBuilt, onSelectDashboard }) {
  const [routes, setRoutes] = useState(loadRouteLibrary);
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || '');
  const [status, setStatus] = useState('Create a route, assign it to a coach, then plot or push it.');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blankForm(selectedFleet));

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) || routes[0] || null,
    [routes, selectedRouteId],
  );

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((route) =>
      `${route.number} ${route.name} ${route.operator} ${route.category} ${(route.stops || []).join(' ')} ${route.destination}`
        .toLowerCase()
        .includes(q),
    );
  }, [routes, search]);

  useEffect(() => {
    if (!selectedRouteId && routes[0]?.id) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);

  const refreshRoutes = () => setRoutes(loadRouteLibrary());

  const startNewRoute = () => {
    setEditing(true);
    setForm(blankForm(selectedFleet));
    setStatus('Creating a new route. Add route number, stops and destination.');
  };

  const editSelectedRoute = () => {
    if (!selectedRoute) return;
    setEditing(true);
    setForm({
      id: selectedRoute.id,
      number: selectedRoute.number || '',
      name: selectedRoute.name || '',
      operator: selectedRoute.operator || selectedFleet.operator || 'Go-Ahead Coach Ops',
      category: selectedRoute.category || 'Route',
      stopsText: (selectedRoute.stops || []).join('\n'),
      destination: selectedRoute.destination || '',
      notes: selectedRoute.notes || '',
    });
    setStatus(`Editing ${selectedRoute.number} - ${selectedRoute.name}.`);
  };

  const saveRoute = () => {
    if (!form.number.trim() || !form.name.trim() || !form.destination.trim()) {
      setStatus('Route number, name and destination are required.');
      return;
    }

    const route = {
      id: form.id || makeId(`${form.number}-${form.name}`),
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
    setEditing(false);
    setForm(blankForm(selectedFleet));
  };

  const deleteRoute = () => {
    if (!selectedRoute) return;
    const ok = window.confirm(`Delete/ hide route ${selectedRoute.number} - ${selectedRoute.name}?`);
    if (!ok) return;
    deleteCustomRoute(selectedRoute.id);
    refreshRoutes();
    setSelectedRouteId('');
    setStatus('Route removed from the library.');
  };

  const resetStarters = () => {
    resetStarterRoutes();
    refreshRoutes();
    setStatus('Starter routes restored.');
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
      setStatus(`${selectedRoute.number} ${push ? 'pushed' : 'plotted'} for ${selectedFleet.fleetNo}: ${built.distanceMiles} miles · ${built.durationMinutes} mins.`);
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
          <p>Build permanent school runs, rail work, shuttles and airport jobs. Select a route, assign it to a coach, then plot or push it.</p>
        </div>
        <strong>Selected coach: {selectedFleet.fleetNo} / {selectedFleet.reg}</strong>
      </div>

      <div className="routes-library-grid">
        <div className="route-library-list card">
          <div className="route-library-toolbar">
            <h3>Saved Routes</h3>
            <button type="button" onClick={startNewRoute}>+ Create</button>
          </div>
          <input
            className="route-library-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search 315, school, rail, airport..."
          />
          {filteredRoutes.map((route) => (
            <button
              key={route.id}
              type="button"
              className={selectedRoute?.id === route.id ? 'route-library-item active' : 'route-library-item'}
              onClick={() => {
                setSelectedRouteId(route.id);
                setEditing(false);
              }}
            >
              <strong>{route.number}</strong>
              <span>{route.name}</span>
              <small>{route.category} · {route.operator}{route.starter ? ' · starter' : ''}</small>
            </button>
          ))}
          <button className="soft-button" type="button" onClick={resetStarters}>Restore starter routes</button>
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
                <button disabled={busy} onClick={editSelectedRoute}>Edit</button>
                <button disabled={busy} className="danger-soft" onClick={deleteRoute}>Delete</button>
              </div>
            </>
          ) : <p>No route selected.</p>}
          <p className="route-status">{status}</p>
        </div>

        <div className="route-library-create card">
          <h3>{editing ? 'Create / Edit Route' : 'Create Route'}</h3>
          {!editing && <p>Select + Create or Edit to open the form.</p>}
          {editing && (
            <>
              <label>Route number<input value={form.number} onChange={(e) => setForm((c) => ({ ...c, number: e.target.value }))} placeholder="315" /></label>
              <label>Name<input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Whitby School Run" /></label>
              <label>Operator<input value={form.operator} onChange={(e) => setForm((c) => ({ ...c, operator: e.target.value }))} /></label>
              <label>Type<input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} placeholder="School / Rail / Event" /></label>
              <label>Stops / pickups<textarea value={form.stopsText} onChange={(e) => setForm((c) => ({ ...c, stopsText: e.target.value }))} placeholder={'One stop per line\nSleights\nRuswarp\nWhitby'} /></label>
              <PlaceSearchBox compact label="Destination" value={form.destination} setValue={(value) => setForm((c) => ({ ...c, destination: value }))} placeholder="Caedmon College Whitby" />
              <label>Notes<textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Contract notes, access instructions, pickup notes..." /></label>
              <div className="route-library-actions">
                <button disabled={busy} onClick={saveRoute}>Save Route</button>
                <button type="button" onClick={() => { setEditing(false); setForm(blankForm(selectedFleet)); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
