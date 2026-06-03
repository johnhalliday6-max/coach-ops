import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const route = [
  {
    name: 'Start',
    label: 'York',
    position: [53.959, -1.081],
  },
  {
    name: 'Service Stop',
    label: 'Peterborough Services',
    position: [52.574, -0.242],
  },
  {
    name: 'Destination',
    label: 'London Victoria',
    position: [51.507, -0.128],
  },
]

const routeLine = route.map((stop) => stop.position)

export default function RouteMap() {
  return (
    <MapContainer
      center={[52.6, -0.6]}
      zoom={7}
      style={{ height: '700px', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Polyline
        positions={routeLine}
        pathOptions={{
          color: '#1268ff',
          weight: 6,
        }}
      />

      {route.map((stop) => (
        <Marker key={stop.name} position={stop.position}>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.label}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}