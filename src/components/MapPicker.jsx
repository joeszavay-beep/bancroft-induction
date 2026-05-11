import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation } from 'lucide-react'

// Fix Leaflet default marker icon (broken in bundlers)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Sub-component: click map to place marker
function ClickHandler({ onPlace }) {
  useMapEvents({
    click(e) {
      onPlace({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    },
  })
  return null
}

// Sub-component: fly map to new center
function FlyTo({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, 16, { duration: 0.8 })
  }, [center])
  return null
}

export default function MapPicker({ latitude, longitude, radius = 200, onChange, height = 260, primaryColour = '#1B6FC8' }) {
  const [flyTarget, setFlyTarget] = useState(null)
  const [locating, setLocating] = useState(false)

  const center = latitude && longitude ? [latitude, longitude] : [53.5, -1.5] // UK default
  const zoom = latitude ? 16 : 6

  function handleUseMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        onChange(coords)
        setFlyTarget([coords.latitude, coords.longitude])
        setLocating(false)
      },
      () => { setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function handleMarkerDrag(e) {
    const { lat, lng } = e.target.getLatLng()
    onChange({ latitude: lat, longitude: lng })
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: '100%' }}
        scrollWheelZoom={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler onPlace={onChange} />
        {flyTarget && <FlyTo center={flyTarget} />}

        {latitude && longitude && (
          <>
            <Marker
              position={[latitude, longitude]}
              draggable={true}
              eventHandlers={{ dragend: handleMarkerDrag }}
            />
            <Circle
              center={[latitude, longitude]}
              radius={radius}
              pathOptions={{ color: primaryColour, fillColor: primaryColour, fillOpacity: 0.1, weight: 2, dashArray: '6 4' }}
            />
          </>
        )}
      </MapContainer>

      {/* Use My Location button overlay */}
      <button
        type="button"
        onClick={handleUseMyLocation}
        style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          background: '#fff', border: '1px solid #e2e8f0',
          fontSize: 12, fontWeight: 600, color: '#334155',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        {locating ? (
          <div style={{ width: 14, height: 14, border: '2px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <Navigation size={14} />
        )}
        My Location
      </button>

      {!latitude && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '12px 20px',
          textAlign: 'center', pointerEvents: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>Click the map to set site location</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>or use the My Location button</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
