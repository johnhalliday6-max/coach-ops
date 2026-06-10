import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  deleteSharedRoute,
  loadRouteLibrary,
  loadSharedRouteLibrary,
  prepareRouteTemplate,
  routeMatchesCompany,
  saveSharedRoute,
} from '../data/routeLibrary';
import { fleetData } from '../data/fleetData';
import { buildVehicleRoute, pushRouteToDriver, saveActiveRoute } from '../shared/routePlanning';
import PlaceSearchBox from './PlaceSearchBox';

const builderStopIcon = L.divIcon({
  className: 'map-emoji-marker planned-stop-marker',
  html: '📍',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const builderViaIcon = L.divIcon({
  className: 'map-emoji-marker route-via-marker',
  html: '•',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function makeId(value) {
  return String(value || 'route')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `route-${Date.now()}`;
}


function getManagedFleet() {
  if (typeof window === 'undefined') return fleetData;
  try {
    const stored = JSON.parse(window.localStorage.getItem('coachOpsManagedFleet') || 'null');
    return Array.isArray(stored) && stored.length ? stored : fleetData;
  } catch {
    return fleetData;
  }
}

function blankForm(selectedFleet) {
  return {
    id: '',
    number: '',
    name: '',
    operator: selectedFleet?.operator || 'Go-Ahead Coach Ops',
    category: 'Route',
    searchText: '',
    notes: '',
    points: [],
  };
}

function companyForVehicle(vehicle) {
  return vehicle?.category || vehicle?.operator || 'Unassigned';
}

function MapClickAdder({ onAdd }) {
  const clickTimer = useRef(null);

  useMapEvents({
    click(event) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = window.setTimeout(() => {
        onAdd?.({
          label: `Via road ${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`,
          lat: event.latlng.lat,
          lng: event.latlng.lng,
          type: 'via',
        });
      }, 220);
    },
    dblclick(event) {
      window.clearTimeout(clickTimer.current);
      onAdd?.({
        label: `Pickup ${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`,
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        type: 'stop',
      });
    },
  });
  return null;
}

function normalisePoint(item, index) {
  if (typeof item === 'string') return { label: item, lat: null, lng: null, id: `${item}-${index}`, type: 'stop' };
  return {
    id: item.id || `${item.label || 'point'}-${index}`,
    label: item.label || item.name || `Stop ${index + 1}`,
    lat: Number.isFinite(Number(item.lat)) ? Number(item.lat) : null,
    lng: Number.isFinite(Number(item.lng)) ? Number(item.lng) : null,
    type: item.type === 'via' ? 'via' : 'stop',
  };
}

export default function RouteLibraryPage({ selectedFleet, onRouteBuilt, onSelectDashboard }) {
  const [routes, setRoutes] = useState(loadRouteLibrary);
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || '');
  const [status, setStatus] = useState('Start from scratch: search or click the map to add stops, then save the route.');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(true);
  const [form, setForm] = useState(blankForm(selectedFleet));
  const [targetFleetNo, setTargetFleetNo] = useState(selectedFleet?.fleetNo || '');
  const [companyFilter, setCompanyFilter] = useState(companyForVehicle(selectedFleet));
  const [reverseRoute, setReverseRoute] = useState(false);

  const availableFleet = useMemo(() => getManagedFleet(), []);
  const targetFleet = useMemo(() => availableFleet.find((item) => item.fleetNo === targetFleetNo) || selectedFleet, [availableFleet, targetFleetNo, selectedFleet]);
  const companyOptions = useMemo(
    () => ['All', ...new Set(availableFleet.map(companyForVehicle).filter(Boolean))],
    [availableFleet],
  );

  useEffect(() => {
    if (selectedFleet?.fleetNo) {
      setTargetFleetNo(selectedFleet.fleetNo);
      setCompanyFilter(companyForVehicle(selectedFleet));
    }
  }, [selectedFleet]);

  useEffect(() => {
    let cancelled = false;
    loadSharedRouteLibrary(companyFilter)
      .then((sharedRoutes) => {
        if (!cancelled) setRoutes(sharedRoutes.length ? sharedRoutes : loadRouteLibrary());
      })
      .catch((error) => {
        console.warn('Could not load shared route library', error);
        if (!cancelled) setRoutes(loadRouteLibrary());
      });
    return () => {
      cancelled = true;
    };
  }, [companyFilter]);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) || null,
    [routes, selectedRouteId],
  );

  const builderPoints = useMemo(() => (form.points || []).map(normalisePoint), [form.points]);
  const builderPositions = builderPoints
    .filter((point) => point.lat != null && point.lng != null)
    .map((point) => [point.lat, point.lng]);

  const selectedPoints = useMemo(() => {
    if (!selectedRoute) return [];
    const source = selectedRoute.plotPoints?.length
      ? selectedRoute.plotPoints
      : [...(selectedRoute.stops || []), selectedRoute.destination].filter(Boolean);
    return source.map(normalisePoint);
  }, [selectedRoute]);

  const selectedPositions = selectedPoints
    .filter((point) => point.lat != null && point.lng != null)
    .map((point) => [point.lat, point.lng]);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return routes.filter((route) => {
      if (!routeMatchesCompany(route, companyFilter)) return false;
      if (!q) return true;
      return `${route.number} ${route.name} ${route.operator} ${route.category} ${(route.stops || []).join(' ')} ${route.destination}`
        .toLowerCase()
        .includes(q);
    });
  }, [routes, search, companyFilter]);

  useEffect(() => {
    if (!selectedRouteId && routes[0]?.id) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);

  useEffect(() => {
    if (filteredRoutes.length && !filteredRoutes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(filteredRoutes[0].id);
      setEditing(false);
    }
  }, [filteredRoutes, selectedRouteId]);

  const refreshRoutes = async () => {
    try {
      const sharedRoutes = await loadSharedRouteLibrary(companyFilter);
      setRoutes(sharedRoutes.length ? sharedRoutes : loadRouteLibrary());
    } catch {
      setRoutes(loadRouteLibrary());
    }
  };

  const startNewRoute = () => {
    setEditing(true);
    setSelectedRouteId('');
    setForm(blankForm(selectedFleet));
    setStatus('New blank route. Add stops from the map/search, then save it.');
  };

  const editSelectedRoute = () => {
    if (!selectedRoute) return;
    const points = selectedRoute.plotPoints?.length
      ? selectedRoute.plotPoints
      : [...(selectedRoute.stops || []), selectedRoute.destination].filter(Boolean).map((label) => ({ label }));
    setEditing(true);
    setForm({
      id: selectedRoute.id,
      number: selectedRoute.number || '',
      name: selectedRoute.name || '',
      operator: selectedRoute.operator || selectedFleet.operator || 'Go-Ahead Coach Ops',
      category: selectedRoute.category || 'Route',
      searchText: '',
      notes: selectedRoute.notes || '',
      points,
    });
    setStatus(`Editing ${selectedRoute.number || ''} ${selectedRoute.name || ''}.`);
  };

  const addPoint = (point) => {
    if (!point?.label) return;
    setForm((current) => ({
      ...current,
      searchText: '',
      points: [
        ...(current.points || []),
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          label: point.label,
          lat: point.lat ?? null,
          lng: point.lng ?? null,
          type: point.type === 'via' ? 'via' : 'stop',
        },
      ],
    }));
    setStatus(point.type === 'via' ? `Added via road: ${point.label}` : `Added pickup stop: ${point.label}`);
  };

  const removePoint = (index) => {
    setForm((current) => ({ ...current, points: current.points.filter((_, i) => i !== index) }));
  };

  const movePoint = (index, direction) => {
    setForm((current) => {
      const next = [...current.points];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, points: next };
    });
  };

  const saveRoute = async () => {
    const points = (form.points || []).map(normalisePoint).filter((point) => point.label.trim());
    if (!form.number.trim() || !form.name.trim()) {
      setStatus('Route number and route name are required.');
      return;
    }
    if (points.length < 2) {
      setStatus('Add at least two points: a start/pickup and a destination.');
      return;
    }

    const destination = points[points.length - 1].label;
    const stops = points.slice(0, -1).filter((point) => point.type !== 'via').map((point) => point.label);
    const route = {
      id: form.id || makeId(`${form.number}-${form.name}`),
      number: form.number.trim(),
      name: form.name.trim(),
      operator: form.operator.trim() || selectedFleet.operator,
      category: form.category.trim() || 'Route',
      stops,
      destination,
      plotPoints: points,
      notes: form.notes.trim(),
    };

    setBusy(true);
    try {
      const savedRoute = await saveSharedRoute(route);
      await refreshRoutes();
      setSelectedRouteId(savedRoute.id || route.id);
      setStatus(`Saved route ${route.number} - ${route.name}.`);
      setEditing(false);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Could not save route.');
    } finally {
      setBusy(false);
    }
  };

  const deleteRoute = async () => {
    if (!selectedRoute) return;
    const ok = window.confirm(`Delete route ${selectedRoute.number} - ${selectedRoute.name}?`);
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSharedRoute(selectedRoute.id);
      await refreshRoutes();
      setSelectedRouteId('');
      setEditing(true);
      setForm(blankForm(selectedFleet));
      setStatus('Route removed from the library.');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Could not delete route.');
    } finally {
      setBusy(false);
    }
  };

  const plotRoute = async ({ push = false } = {}) => {
    if (!selectedRoute) {
      setStatus('Select a saved route first.');
      return;
    }

    setBusy(true);
    const routeVehicle = push ? targetFleet : selectedFleet;
    setStatus(`${push ? 'Pushing' : 'Plotting'} ${selectedRoute.number} for ${routeVehicle.fleetNo}...`);
    try {
      const built = await buildVehicleRoute(routeVehicle, selectedRoute);
      await saveActiveRoute(built);
      onRouteBuilt?.(built);
      if (push) await pushRouteToDriver(routeVehicle, built);
      setStatus(`${selectedRoute.number} ${push ? 'pushed' : 'plotted'} for ${routeVehicle.fleetNo}: ${built.distanceMiles} miles · ${built.durationMinutes} mins.`);
      onSelectDashboard?.();
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Could not plot saved route.');
    } finally {
      setBusy(false);
    }
  };

  const mapPoints = editing ? builderPoints : selectedPoints;
  const mapPositions = editing ? builderPositions : selectedPositions;

  return (
    <section className="page routes-library-page">
      <div className="routes-library-header">
        <div>
          <h2>Route Builder</h2>
          <p>No starter/demo routes. Build each company route from scratch on the map, save it, then plot or push it to a coach.</p>
        </div>
        <strong>Selected coach: {selectedFleet.fleetNo} / {selectedFleet.reg}</strong>
      </div>

      <div className="routes-builder-grid">
        <div className="route-library-list card">
          <div className="route-library-toolbar">
            <h3>Saved Routes</h3>
            <button type="button" onClick={startNewRoute}>+ New blank route</button>
          </div>
          <label className="route-company-filter">
            Company
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              {companyOptions.map((company) => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </label>
          <input
            className="route-library-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search saved routes..."
          />
          {filteredRoutes.length === 0 && <p className="empty-route-message">No saved routes yet. Create the first one from the map.</p>}
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
              <small>{route.category} · {route.operator}</small>
            </button>
          ))}
        </div>

        <div className="route-map-builder card">
          <div className="route-map-builder-title">
            <div>
              <h3>{editing ? 'Create Route on Map' : 'Saved Route Map'}</h3>
              <p>{editing ? 'Search for stops, single-click roads to shape the route, double-click pickups. Last point is the destination.' : 'Select edit to change stops or order.'}</p>
            </div>
            {!editing && selectedRoute && <button type="button" onClick={editSelectedRoute}>Edit this route</button>}
          </div>

          {editing && (
            <div className="route-builder-form-row">
              <label>Route number<input value={form.number} onChange={(e) => setForm((c) => ({ ...c, number: e.target.value }))} placeholder="315" /></label>
              <label>Route name<input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Whitby School Run" /></label>
              <label>Company<input value={form.operator} onChange={(e) => setForm((c) => ({ ...c, operator: e.target.value }))} /></label>
              <label>Type<input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} placeholder="School / Rail / Event" /></label>
            </div>
          )}

          {editing && (
            <PlaceSearchBox
              compact
              label="Add stop / pickup / destination"
              value={form.searchText}
              setValue={(value) => setForm((c) => ({ ...c, searchText: value }))}
              onPick={addPoint}
              placeholder="Search school, station, hotel, services, postcode..."
            />
          )}

          <div className="route-builder-map-wrap">
            <MapContainer center={[54.28, -1.25]} zoom={7} scrollWheelZoom doubleClickZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {editing && <MapClickAdder onAdd={addPoint} />}
              {mapPositions.length > 1 && <Polyline positions={mapPositions} weight={5} />}
              {mapPoints.map((point, index) => (
                point.lat != null && point.lng != null ? (
                  <Marker key={point.id || `${point.label}-${index}`} position={[point.lat, point.lng]} icon={point.type === 'via' ? builderViaIcon : builderStopIcon}>
                    <Popup>{index + 1}. {point.type === 'via' ? 'Via road' : 'Pickup'}<br />{point.label}</Popup>
                  </Marker>
                ) : null
              ))}
            </MapContainer>
          </div>

          <div className="route-builder-stop-panel">
            <h4>{editing ? 'Plotted Route' : selectedRoute ? `${selectedRoute.number} - ${selectedRoute.name}` : 'No route selected'}</h4>
            {mapPoints.length === 0 && <p>No points yet. Search for a place or click the map.</p>}
            <ol className="route-stop-list builder-stop-list">
              {mapPoints.map((point, index) => (
                <li key={point.id || `${point.label}-${index}`}>
                  <span>
                    <small className={point.type === 'via' && !(index === mapPoints.length - 1 && mapPoints.length > 1) ? 'route-point-type via' : 'route-point-type stop'}>
                      {index === mapPoints.length - 1 && mapPoints.length > 1 ? 'Destination' : point.type === 'via' ? 'Via road' : 'Pickup'}
                    </small>
                    {point.label}
                  </span>
                  {editing && (
                    <div>
                      <button type="button" onClick={() => movePoint(index, -1)}>↑</button>
                      <button type="button" onClick={() => movePoint(index, 1)}>↓</button>
                      <button type="button" onClick={() => removePoint(index)}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {editing && (
            <label className="builder-notes">Notes<textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Contract notes, access instructions, pickup notes..." /></label>
          )}

          {!editing && selectedRoute && (
            <div className="route-push-target-row">
              <label className="route-reverse-toggle">
                <input
                  type="checkbox"
                  checked={reverseRoute}
                  onChange={(event) => setReverseRoute(event.target.checked)}
                />
                Run this route in reverse
              </label>
              <label>
                Push to coach
                <select value={targetFleetNo} onChange={(event) => setTargetFleetNo(event.target.value)}>
                  {availableFleet.filter((item) => companyFilter === 'All' || companyForVehicle(item) === companyFilter).map((item) => (
                    <option key={item.fleetNo} value={item.fleetNo}>{item.fleetNo} / {item.reg} · {item.depot}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="route-library-actions route-builder-actions">
            {editing ? (
              <>
                <button disabled={busy} onClick={saveRoute}>Save Route</button>
                <button type="button" onClick={() => { setEditing(false); setForm(blankForm(selectedFleet)); }}>Cancel</button>
              </>
            ) : (
              <>
                <button disabled={busy || !selectedRoute} onClick={() => plotRoute({ push: false })}>🗺 Plot on Office Map</button>
                <button disabled={busy || !selectedRoute || !targetFleet} onClick={() => plotRoute({ push: true })}>📲 Push to Selected Coach</button>
                <button disabled={busy || !selectedRoute} className="danger-soft" onClick={deleteRoute}>Delete</button>
              </>
            )}
          </div>
          <p className="route-status">{status}</p>
        </div>
      </div>
    </section>
  );
}
