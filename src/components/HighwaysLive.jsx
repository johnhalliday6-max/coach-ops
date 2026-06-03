import { useEffect, useState } from 'react'
import { highwaysTestAlerts } from '../data/highwaysTestAlerts'

export default function HighwaysLive() {
  const [alerts, setAlerts] = useState(highwaysTestAlerts)
  const [status, setStatus] = useState('Using test data')

  useEffect(() => {
    const key = import.meta.env.VITE_HIGHWAYS_API_KEY

    if (!key) {
      setStatus('No API key found')
      return
    }

    fetch('/api/highways')
      .then((res) => res.json())
      .then((data) => {
        console.log('National Highways response:', data)

        const rows =
          data.features ||
          data.items ||
          data.value ||
          data.closures ||
          data.results ||
          data ||
          []

        const mapped = rows.slice(0, 6).map((item, index) => {
          const p = item.properties || item

          return {
            id: index + 1,
            road: p.road || p.roadName || p.roadNumber || p.roadNameValue || 'Road',
            location: p.location || p.description || p.eventLocation || p.name || 'Live closure',
            type: p.closureType || p.eventType || p.type || 'Closure',
            detail: p.reason || p.description || p.eventDescription || 'Live National Highways alert',
            speed: p.speedLimit || p.speed || 'Live',
            source: 'National Highways',
            severity: p.severity || p.impact || 'Live',
          }
        })

        if (mapped.length > 0) {
          setAlerts(mapped)
          setStatus('Live API connected')
        } else {
          setStatus('Connected but no closures returned')
        }
      })
      .catch((err) => {
        console.error(err)
        setStatus('API failed - using test data')
      })
  }, [])

  return (
    <section className="highways-panel">
      <h2>National Highways Live</h2>
      <p style={{ marginTop: 0, color: '#9fb3c8' }}>{status}</p>

      <div className="highways-grid">
        {alerts.map((alert) => (
          <div className="highways-card" key={alert.id}>
            <div className="highways-top">
              <strong>{alert.road}</strong>
              <span>{alert.speed}</span>
            </div>

            <h3>{alert.location}</h3>
            <p><strong>{alert.type}</strong></p>
            <p>{alert.detail}</p>
            <small>{alert.source} · {alert.severity}</small>
          </div>
        ))}
      </div>
    </section>
  )
}