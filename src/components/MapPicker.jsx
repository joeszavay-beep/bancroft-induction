import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, Search, Check, X, MapPin } from 'lucide-react'

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
  // Staged position (not yet confirmed)
  const [staged, setStaged] = useState(
    latitude && longitude ? { latitude, longitude } : null
  )
  const [flyTarget, setFlyTarget] = useState(null)
  const [locating, setLocating] = useState(false)

  // Address search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef(null)

  // Reverse geocode display
  const [reverseAddress, setReverseAddress] = useState(null)
  const [reversing, setReversing] = useState(false)

  // Sync external prop changes into staged
  useEffect(() => {
    if (latitude && longitude) {
      setStaged({ latitude, longitude })
    }
  }, [latitude, longitude])

  // Reverse geocode when staged changes
  useEffect(() => {
    if (!staged) { setReverseAddress(null); return }
    setReversing(true)
    const controller = new AbortController()
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${staged.latitude}&lon=${staged.longitude}&zoom=18`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { setReverseAddress(data.display_name || null); setReversing(false) })
      .catch(() => setReversing(false))
    return () => controller.abort()
  }, [staged?.latitude, staged?.longitude])

  const center = staged ? [staged.latitude, staged.longitude] : [53.5, -1.5]
  const zoom = staged ? 16 : 6

  function handlePlace(coords) {
    setStaged(coords)
    setFlyTarget([coords.latitude, coords.longitude])
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setStaged(coords)
        setFlyTarget([coords.latitude, coords.longitude])
        setLocating(false)
      },
      () => { setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function handleMarkerDrag(e) {
    const { lat, lng } = e.target.getLatLng()
    setStaged({ latitude: lat, longitude: lng })
  }

  function handleConfirm() {
    if (staged) onChange(staged)
  }

  function handleCancel() {
    // Revert to the committed position
    if (latitude && longitude) {
      setStaged({ latitude, longitude })
      setFlyTarget([latitude, longitude])
    } else {
      setStaged(null)
    }
  }

  // Address search via Nominatim
  const handleSearch = useCallback((val) => {
    setSearchQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setSearchResults([]); setShowResults(false); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val.trim())}&limit=5&countrycodes=gb`)
        const data = await res.json()
        setSearchResults(data || [])
        setShowResults(true)
      } catch {
        setSearchResults([])
      }
      setSearching(false)
    }, 400)
  }, [])

  function selectSearchResult(result) {
    const coords = { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) }
    setStaged(coords)
    setFlyTarget([coords.latitude, coords.longitude])
    setShowResults(false)
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','))
  }

  // Has the staged position changed from the committed one?
  const hasUnsavedChange = staged && (
    !latitude || !longitude ||
    Math.abs(staged.latitude - latitude) > 0.000001 ||
    Math.abs(staged.longitude - longitude) > 0.000001
  )

  return (
    <div style={{ position: 'relative' }}>
      {/* Address search input */}
      <div style={{ position: 'relative', marginBottom: 8, zIndex: 10 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => { if (searchResults.length) setShowResults(true) }}
          placeholder="Search address or postcode..."
          style={{
            width: '100%', padding: '9px 12px 9px 32px', fontSize: 12,
            border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
            background: '#fff', color: '#334155',
          }}
        />
        {searching && (
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        )}
        {showResults && searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4, maxHeight: 200, overflowY: 'auto',
          }}>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => selectSearchResult(r)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  fontSize: 11, color: '#334155', border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: i < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}
                onMouseEnter={e => e.target.style.background = '#f8fafc'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map container — z-index: 0 to prevent bleeding above other elements */}
      <div style={{ position: 'relative', zIndex: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height, width: '100%' }}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPlace={handlePlace} />
          {flyTarget && <FlyTo center={flyTarget} />}

          {staged && (
            <>
              <Marker
                position={[staged.latitude, staged.longitude]}
                draggable={true}
                eventHandlers={{ dragend: handleMarkerDrag }}
              />
              <Circle
                center={[staged.latitude, staged.longitude]}
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
            position: 'absolute', bottom: 12, right: 12, zIndex: 1,
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

        {!staged && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1,
            background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '12px 20px',
            textAlign: 'center', pointerEvents: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>Click the map to set site location</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>or search an address above</p>
          </div>
        )}
      </div>

      {/* Confirm bar — shown when there's an unsaved change */}
      {staged && hasUnsavedChange && (
        <div style={{ marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', padding: '10px 14px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <MapPin size={14} style={{ color: primaryColour, marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: '#334155', margin: 0, fontWeight: 600 }}>
                {staged.latitude.toFixed(5)}, {staged.longitude.toFixed(5)}
              </p>
              {reversing ? (
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0' }}>Looking up address...</p>
              ) : reverseAddress ? (
                <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0', lineHeight: 1.4 }}>{reverseAddress}</p>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleCancel}
              style={{
                flex: 1, padding: '7px 12px', fontSize: 12, fontWeight: 600,
                border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
                color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <X size={13} /> Cancel
            </button>
            <button type="button" onClick={handleConfirm}
              style={{
                flex: 1, padding: '7px 12px', fontSize: 12, fontWeight: 600,
                border: 'none', borderRadius: 8, background: primaryColour,
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <Check size={13} /> Confirm Location
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
