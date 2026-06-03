import { useEffect, useState } from 'react'
import { highwaysTestAlerts } from '../data/highwaysTestAlerts'

export default function HighwaysLive() {
  const [alerts, setAlerts] = useState(highwaysTestAlerts)
  const [status, setStatus] = useState('Using test data')

  useEffect(() => {
    fetch('/api/highways')
      .then((res) => res.json())
      .then((data) => {
        console.log('National Highways response:', data)

        if (data?.ok && Array.isArray(data.alerts)) {
          setAlerts(data.alerts)
          setStatus(`Live API connected · ${data.count} alerts`)
          return
        }

        setStatus('Connected but no alerts returned')
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