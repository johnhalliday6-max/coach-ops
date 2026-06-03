import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const stopIcon = L.divIcon({
  className: "map-emoji-marker stop-marker",
  html: "🚌",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const closureIcon = L.divIcon({
  className: "map-emoji-marker closure-marker",
  html: "🚧",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const route = [
  {
    name: "Start",
    label: "York",
    position: [53.959, -1.081],
  },
  {
    name: "Service Stop",
    label: "Peterborough Services",
    position: [52.574, -0.242],
  },
  {
    name: "Destination",
    label: "London Victoria",
    position: [51.507, -0.128],
  },
];

const routeLine = route.map((stop) => stop.position);

export default function RouteMap({ height = "700px" }) {
  const [highwaysAlerts, setHighwaysAlerts] = useState([]);

  useEffect(() => {
    fetch("/api/highways")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.alerts)) {
          setHighwaysAlerts(
            data.alerts.filter((alert) => alert.lat && alert.lng),
          );
        }
      })
      .catch((err) => console.error("Map highways error:", err));
  }, []);

  return (
    <MapContainer
      center={[52.6, -0.6]}
      zoom={7}
      style={{ height, width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Polyline
        positions={routeLine}
        pathOptions={{
          color: "#1268ff",
          weight: 6,
        }}
      />

      {route.map((stop) => (
        <Marker key={stop.name} position={stop.position} icon={stopIcon}>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.label}
          </Popup>
        </Marker>
      ))}

      {highwaysAlerts.map((alert) => (
        <Marker
          key={`highways-${alert.id}`}
          position={[alert.lat, alert.lng]}
          icon={closureIcon}
        >
          <Popup>
            <strong>{alert.road}</strong>
            <br />
            {alert.detail}
            <br />
            <small>{alert.source}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
