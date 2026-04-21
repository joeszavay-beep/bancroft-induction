import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, LogIn, LogOut, MapPin, Clock, Users, CheckCircle2, ArrowLeft, Shield } from 'lucide-react'

export default function SiteSignIn() {
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [operatives, setOperatives] = useState([])
  const [attendance, setAttendance] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOperative, setSelectedOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)
  const [success, setSuccess] = useState(null) // { type, name, time }
  const [geoPosition, setGeoPosition] = useState(null)

  // Fetch project, operatives, and today's attendance on mount
  useEffect(() => {
    if (!projectId) return

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const fetchData = async () => {
      setLoading(true)
      const [projectRes, operativesRes, attendanceRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*, companies(name, primary_colour)')
          .eq('id', projectId)
          .single(),
        supabase
          .from('operatives')
          .select('id, name, role, photo_url, operative_projects!inner(project_id)')
          .eq('operative_projects.project_id', projectId)
          .order('name'),
        supabase
          .from('site_attendance')
          .select('*')
          .eq('project_id', projectId)
          .gte('recorded_at', todayStart.toISOString())
          .order('recorded_at', { ascending: false }),
      ])

      if (projectRes.data) setProject(projectRes.data)
      if (operativesRes.data) setOperatives(operativesRes.data)
      if (attendanceRes.data) setAttendance(attendanceRes.data)
      setLoading(false)
    }

    fetchData()
  }, [projectId])

  // Try to capture GPS on mount (non-blocking)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
        },
        () => {
          // Permission denied or error — leave null
        }
      )
    }
  }, [])

  // Auto-dismiss success screen after 4 seconds
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => {
      setSuccess(null)
      setSelectedOperative(null)
      setSearchQuery('')
    }, 4000)
    return () => clearTimeout(timer)
  }, [success])

  // Compute who is currently on site
  const currentlyOnSite = (() => {
    const statusMap = {}
    // attendance is sorted desc by recorded_at, so the first record per operative is the latest
    for (const record of attendance) {
      if (!statusMap[record.operative_id]) {
        statusMap[record.operative_id] = record
      }
    }
    return Object.values(statusMap).filter((r) => r.type === 'sign_in')
  })()

  // Filter operatives by search query
  const filteredOperatives = operatives.filter((op) =>
    op.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0][0].toUpperCase()
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  function checkTimingFlag(type, now) {
    const startTime = project?.start_time || '07:30'
    const endTime = project?.end_time || '17:00'
    const grace = 10 // minutes

    const nowMins = now.getHours() * 60 + now.getMinutes()
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const startMins = sh * 60 + sm
    const endMins = eh * 60 + em

    if (type === 'sign_in') {
      if (nowMins > startMins + grace) return 'late'
      if (nowMins < startMins - grace) return 'early'
    }
    if (type === 'sign_out') {
      if (nowMins < endMins - grace) return 'early'
      if (nowMins > endMins + grace) return 'overtime'
    }
    return null
  }

  const handleRecord = async (type) => {
    if (!selectedOperative || recording) return
    setRecording(true)

    const now = new Date()
    const flag = checkTimingFlag(type, now)

    const record = {
      company_id: project?.company_id || project?.companies?.id || null,
      project_id: projectId,
      operative_id: selectedOperative.id,
      operative_name: selectedOperative.name,
      type,
      method: 'qr',
      ip_address: null,
      recorded_at: now.toISOString(),
      notes: flag ? `${flag.charAt(0).toUpperCase() + flag.slice(1)} — ${type === 'sign_in' ? 'arrived' : 'left'} at ${formatTime(now)}` : null,
    }

    if (geoPosition) {
      record.latitude = geoPosition.latitude
      record.longitude = geoPosition.longitude
    }

    const { error } = await supabase.from('site_attendance').insert(record)

    if (!error) {
      setAttendance((prev) => [{ ...record, id: crypto.randomUUID() }, ...prev])
      setSuccess({
        type,
        name: selectedOperative.name,
        time: formatTime(now),
        flag,
      })
    }

    setRecording(false)
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1A2744',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading site...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  // --- Not found ---
  if (!project) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Shield size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px', color: '#1e293b' }}>Project Not Found</h2>
          <p style={{ color: '#64748b', margin: 0 }}>This QR code may be invalid or the project has been removed.</p>
        </div>
      </div>
    )
  }

  const companyName = project.companies?.name || ''
  const primaryColour = project.companies?.primary_colour || '#1A2744'

  // --- Success screen ---
  if (success) {
    const isSignIn = success.type === 'sign_in'
    const bgColor = isSignIn ? '#2EA043' : '#DA3633'

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: bgColor, padding: 32,
      }}>
        <style>{`
          @keyframes scaleIn {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.2); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes fadeInUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        <div style={{ animation: 'scaleIn 0.5s ease-out forwards' }}>
          <CheckCircle2 size={96} color="#fff" strokeWidth={1.5} />
        </div>
        <div style={{ animation: 'fadeInUp 0.5s ease-out 0.3s forwards', opacity: 0, textAlign: 'center', marginTop: 24 }}>
          <h1 style={{ color: '#fff', fontSize: 28, margin: '0 0 8px', fontWeight: 700 }}>
            {isSignIn ? 'Signed In' : 'Signed Out'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 20, margin: '0 0 4px', fontWeight: 600 }}>
            {success.name}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={16} />
            {isSignIn ? 'signed in' : 'signed out'} at {success.time}
          </p>
        </div>
        {success.flag && (
          <div style={{
            animation: 'fadeInUp 0.5s ease-out 0.5s forwards', opacity: 0, marginTop: 16,
            background: success.flag === 'late' ? 'rgba(218,54,51,0.3)' : success.flag === 'early' ? 'rgba(234,88,12,0.3)' : 'rgba(255,255,255,0.15)',
            borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <p style={{ color: '#fff', fontSize: 14, margin: 0, fontWeight: 600 }}>
              {success.flag === 'late' && `⚠ Late arrival — start time is ${project?.start_time || '07:30'}`}
              {success.flag === 'early' && (isSignIn ? `Early arrival` : `⚠ Early departure — end time is ${project?.end_time || '17:00'}`)}
              {success.flag === 'overtime' && `Overtime — end time is ${project?.end_time || '17:00'}`}
            </p>
          </div>
        )}
        {geoPosition && (
          <div style={{ animation: 'fadeInUp 0.5s ease-out 0.5s forwards', opacity: 0, marginTop: 16, display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            <MapPin size={14} />
            Location recorded
          </div>
        )}
        {isSignIn && (
          <div style={{ animation: 'fadeInUp 0.5s ease-out 0.7s forwards', opacity: 0, marginTop: 24, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 20px', maxWidth: 320, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, margin: 0, fontWeight: 500 }}>
              Remember to scan this QR code again when you leave site to sign out
            </p>
          </div>
        )}
      </div>
    )
  }

  // --- Selected operative screen ---
  if (selectedOperative) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
        {/* Header */}
        <div style={{ background: '#1A2744', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setSelectedOperative(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                display: 'flex', alignItems: 'center', color: '#fff',
              }}
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 300, letterSpacing: 1 }}>
                CORE<span style={{ fontWeight: 700 }}>SITE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Operative card */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 20px' }}>
          {/* Avatar */}
          {selectedOperative.photo_url ? (
            <img
              src={selectedOperative.photo_url}
              alt={selectedOperative.name}
              style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', marginBottom: 16, border: '3px solid #e2e8f0' }}
            />
          ) : (
            <div style={{
              width: 100, height: 100, borderRadius: '50%', background: primaryColour,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 36, fontWeight: 700, marginBottom: 16,
            }}>
              {getInitials(selectedOperative.name)}
            </div>
          )}

          <h2 style={{ margin: '0 0 4px', fontSize: 24, color: '#1e293b', fontWeight: 700 }}>
            {selectedOperative.name}
          </h2>
          {selectedOperative.role && (
            <p style={{ margin: '0 0 32px', color: '#64748b', fontSize: 15 }}>
              {selectedOperative.role}
            </p>
          )}

          {/* Show status and the ONLY valid action */}
          {(() => {
            const isOnSite = currentlyOnSite.some(r => r.operative_id === selectedOperative.id)
            const lastRecord = attendance.find(r => r.operative_id === selectedOperative.id)
            const signInTime = isOnSite && lastRecord ? formatTime(lastRecord.recorded_at) : null

            if (isOnSite) {
              return (
                <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2EA043', boxShadow: '0 0 0 3px rgba(46,160,67,0.2)' }} />
                    <span style={{ fontSize: 15, color: '#166534', fontWeight: 600 }}>On site since {signInTime}</span>
                  </div>
                  <button
                    onClick={() => handleRecord('sign_out')}
                    disabled={recording}
                    style={{
                      width: '100%', minHeight: 56, padding: '16px 24px',
                      background: '#DA3633', color: '#fff', border: 'none', borderRadius: 12,
                      fontSize: 18, fontWeight: 700, cursor: recording ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      opacity: recording ? 0.7 : 1, boxShadow: '0 2px 8px rgba(218,54,51,0.3)',
                    }}
                  >
                    <LogOut size={22} />
                    SIGN OUT
                  </button>
                </div>
              )
            }

            return (
              <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lastRecord?.type === 'sign_out' && (
                  <div style={{ background: '#f5f5f5', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />
                    <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Last signed out at {formatTime(lastRecord.recorded_at)}</span>
                  </div>
                )}
                <button
                  onClick={() => handleRecord('sign_in')}
                  disabled={recording}
                  style={{
                    width: '100%', minHeight: 56, padding: '16px 24px',
                    background: '#2EA043', color: '#fff', border: 'none', borderRadius: 12,
                    fontSize: 18, fontWeight: 700, cursor: recording ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: recording ? 0.7 : 1, boxShadow: '0 2px 8px rgba(46,160,67,0.3)',
                  }}
                >
                  <LogIn size={22} />
                  SIGN IN
                </button>
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  // --- Main search screen ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
      {/* Header */}
      <div style={{ background: '#1A2744', padding: '20px 20px 16px', flexShrink: 0 }}>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 300, letterSpacing: 1, marginBottom: 8 }}>
          CORE<span style={{ fontWeight: 700 }}>SITE</span>
        </div>
        <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 2px' }}>
          {project.name}
        </h1>
        {companyName && (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>
            {companyName}
          </p>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '20px 16px' }}>
        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search
            size={20}
            color="#94a3b8"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder="Search your name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            style={{
              width: '100%', padding: '14px 14px 14px 44px', fontSize: 16,
              border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff',
              outline: 'none', boxSizing: 'border-box', color: '#1e293b',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
            onFocus={(e) => { e.target.style.borderColor = primaryColour }}
            onBlur={(e) => { e.target.style.borderColor = '#e2e8f0' }}
          />
        </div>

        {/* Currently on site count */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          background: '#fff', borderRadius: 10, marginBottom: 16,
          border: '1px solid #e2e8f0',
        }}>
          <Users size={18} color={primaryColour} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
            Currently on site: {currentlyOnSite.length}
          </span>
        </div>

        {/* Currently on site — tap to sign out */}
        {!searchQuery && currentlyOnSite.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Tap your name to sign out
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentlyOnSite.map((record) => {
                const op = operatives.find(o => o.id === record.operative_id) || { id: record.operative_id, name: record.operative_name }
                return (
                  <button
                    key={record.operative_id}
                    onClick={() => setSelectedOperative(op)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    {op.photo_url ? (
                      <img src={op.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', background: '#2EA043',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 14, fontWeight: 700,
                      }}>
                        {getInitials(op.name)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#166534' }}>{op.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#4ade80' }}>
                        On site since {formatTime(record.recorded_at)}
                      </p>
                    </div>
                    <LogOut size={18} color="#DA3633" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Operatives list (search results) */}
        {searchQuery.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 8px', fontWeight: 500 }}>
              {filteredOperatives.length} result{filteredOperatives.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredOperatives.map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOperative(op)
                    setSearchQuery('')
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onTouchStart={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
                  onTouchEnd={(e) => { e.currentTarget.style.background = '#fff' }}
                >
                  {op.photo_url ? (
                    <img
                      src={op.photo_url}
                      alt={op.name}
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: primaryColour,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(op.name)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{op.name}</div>
                    {op.role && (
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 1 }}>{op.role}</div>
                    )}
                  </div>
                </button>
              ))}
              {filteredOperatives.length === 0 && (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: 20 }}>
                  No workers found matching "{searchQuery}"
                </p>
              )}
            </div>
          </div>
        )}

        {/* Currently on site list */}
        {currentlyOnSite.length > 0 && (
          <div>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              On site today
            </p>
            <div style={{
              background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}>
              {currentlyOnSite.map((record, i) => {
                const op = operatives.find((o) => o.id === record.operative_id)
                const name = record.operative_name || op?.name || 'Unknown'
                const role = op?.role || ''
                const photoUrl = op?.photo_url || null

                return (
                  <div
                    key={record.id || i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      borderBottom: i < currentlyOnSite.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}
                  >
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={name}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#64748b', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>
                        {getInitials(name)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{name}</div>
                      {role && (
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{role}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>
                      <Clock size={13} />
                      {formatTime(record.recorded_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
