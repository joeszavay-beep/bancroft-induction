import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LogIn, LogOut, MapPin, Clock, CheckCircle2, Shield, Mail, Lock, Eye, EyeOff, HardHat, Check, AlertTriangle } from 'lucide-react'
import { getSession, setSession, removeSession } from '../lib/storage'
import { formatTime } from '../lib/dates'

export default function SiteSignIn() {
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [operative, setOperative] = useState(null) // the logged-in operative
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [recording, setRecording] = useState(false)
  const [success, setSuccess] = useState(null)
  const [geoPosition, setGeoPosition] = useState(null)
  const [geoStatus, setGeoStatus] = useState('pending') // 'pending' | 'granted' | 'denied' | 'blocked'

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [signInNote, setSignInNote] = useState('')
  const [signOutNote, setSignOutNote] = useState('')
  const [error, setError] = useState(null)
  const [rememberMe, setRememberMe] = useState(true)

  // Load project + check existing session
  useEffect(() => {
    if (!projectId) return

    async function init() {
      setLoading(true)

      // Load project via public RPC (branding + geofence + hours) so the kiosk
      // works for anon users under the RLS lockdown.
      const { data: proj } = await supabase.rpc('get_project_public_info', { p_id: projectId })
      if (proj) setProject(proj)

      // Check for existing operative session
      const session = getSession('operative_session')
      if (session) {
        try {
          const data = JSON.parse(session)
          await loadOperativeAndAttendance(data.id, projectId)
        } catch { /* invalid session */ }
      }

      setLoading(false)
    }

    init()
  }, [projectId])

  // Silently attempt GPS capture — if it works, coordinates are recorded. If not, sign-in proceeds without.
  function requestLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGeoStatus('granted')
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    requestLocation()
  }, [])

  // Auto-dismiss success screen — optimistic attendance update is already correct
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 4000)
    return () => clearTimeout(timer)
  }, [success])

  async function loadOperativeAndAttendance(operativeId, projId) {
    const [opRes, attRes] = await Promise.all([
      supabase.rpc('get_operative_public_info', { p_id: operativeId }),
      supabase.rpc('get_operative_attendance', { p_operative_id: operativeId, p_project_id: projId }),
    ])

    if (opRes.data) setOperative(opRes.data)
    // RPC returns JSON array — update attendance if we got records
    const records = Array.isArray(attRes.data) ? attRes.data : []
    if (records.length > 0) setAttendance(records)
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { setAuthError('Enter your email and password'); return }
    setAuthLoading(true)
    setAuthError('')

    try {
      // Authenticate via Supabase Auth — keep the session active for RLS
      const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      })

      if (signInErr || !authData?.user) {
        // Check if this operative exists but has no auth account (booleans only).
        const { data: info } = await supabase.rpc('operative_exists_by_email', { p_email: email.trim().toLowerCase() })
        if (info?.exists && !info.profile_complete) {
          setAuthError('You need to complete your profile first. Check your invite email for the link.')
        } else if (info?.exists) {
          setAuthError('Invalid password. If you haven\'t set a password yet, check your invite email to complete your profile.')
        } else {
          setAuthError('Invalid email or password')
        }
        setAuthLoading(false)
        return
      }

      // Load operative record. Enforce (§5.19 PR5): resolve the auth-linked active
      // record ONLY (matches RLS via auth.uid()). The email fallback is gone — every
      // active operative is linked at account creation; an unlinked login must
      // complete account-linking before it can resolve.
      let op = null
      const OP_SELECT = '*, operative_projects(project_id, projects(name)), companies(name, logo_url, primary_colour)'
      const { data: ops } = await supabase.from('operatives').select(OP_SELECT)
        .eq('auth_user_id', authData.user.id)
        .is('left_at', null)
      if (ops?.length) op = ops[0]

      if (!op) { setAuthError('No worker account found for this email'); setAuthLoading(false); return }

      // Auto-link operative to this project if not already assigned
      await supabase.from('operative_projects').upsert(
        { operative_id: op.id, project_id: projectId },
        { onConflict: 'operative_id,project_id' }
      )

      // Store session (persistent when "Remember Me" is checked)
      setSession('operative_session', JSON.stringify({
        id: op.id, name: op.name, email: op.email, role: op.role,
        photo_url: op.photo_url,
        projects: (op.operative_projects || []).map(r => ({ id: r.project_id, name: r.projects?.name })),
        company_id: op.company_id,
        company_name: op.companies?.name, company_logo: op.companies?.logo_url,
        primary_colour: op.companies?.primary_colour || '#1B6FC8',
      }), rememberMe)

      await loadOperativeAndAttendance(op.id, projectId)
      setAuthLoading(false)
    } catch {
      setAuthError('Something went wrong. Please try again.')
      setAuthLoading(false)
    }
  }


  const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase()
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3 // Earth radius in metres
    const toRad = (deg) => deg * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  function checkTimingFlag(type, now) {
    const startTime = operative?.start_time || project?.start_time || '07:30'
    const endTime = operative?.end_time || project?.end_time || '17:00'
    const grace = 10
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
    if (!operative || recording) return
    setRecording(true)
    setError(null)

    try {
      const now = new Date()
      const flag = checkTimingFlag(type, now)

      // Geofence check
      let offSiteDistance = null
      if (project?.geofence_enabled && project?.site_latitude && geoPosition) {
        const dist = haversineDistance(project.site_latitude, project.site_longitude, geoPosition.latitude, geoPosition.longitude)
        const radius = project.geofence_radius || 200
        if (dist > radius) offSiteDistance = Math.round(dist)
      }

      // Build notes: timing flag + off-site flag + optional user note
      const parts = []
      if (flag) parts.push(flag.charAt(0).toUpperCase() + flag.slice(1))
      if (offSiteDistance) parts.push(`Off-site (${offSiteDistance}m)`)
      if (!geoPosition) parts.push('Location off')
      const action = type === 'sign_in' ? 'arrived' : 'left'
      let notes = parts.length ? `${parts.join(' · ')} — ${action} at ${formatTime(now)}` : null
      const userNote = type === 'sign_in' ? signInNote.trim() : signOutNote.trim()
      if (userNote) {
        notes = notes ? `${notes} | ${userNote}` : userNote
      }

      // Atomic sign-in/out via RPC (prevents duplicate consecutive same-type events)
      const { data: result, error } = await supabase.rpc('record_attendance', {
        p_company_id: operative?.company_id || project?.company_id || null,
        p_project_id: projectId,
        p_operative_id: operative.id,
        p_operative_name: operative.name,
        p_type: type,
        p_method: 'qr',
        p_notes: notes,
        p_latitude: geoPosition?.latitude || null,
        p_longitude: geoPosition?.longitude || null,
      })

      if (error) {
        console.error('Attendance RPC error:', error)
        setError(`Failed to ${type === 'sign_in' ? 'sign in' : 'sign out'}. Please try again.`)
        await loadOperativeAndAttendance(operative.id, projectId)
        return
      }

      if (result?.duplicate) {
        // Already in this state — set attendance directly so button shows correctly
        // (DB read may return empty due to RLS, so don't rely on reload)
        setAttendance((prev) => {
          if (prev.length > 0 && prev[0].type === type) return prev
          return [{ type, operative_id: operative.id, recorded_at: new Date().toISOString(), id: 'dup' }, ...prev]
        })
      } else if (result?.success) {
        setAttendance((prev) => [{ type, operative_id: operative.id, recorded_at: now.toISOString(), id: result.id }, ...prev])
        setSuccess({ type, name: operative.name, time: formatTime(now), flag, offSiteDistance })
        if (type === 'sign_in') setSignInNote('')
        if (type === 'sign_out') setSignOutNote('')
      } else {
        // Unexpected response — refresh from DB to sync the UI
        console.error('Unexpected RPC response:', result)
        await loadOperativeAndAttendance(operative.id, projectId)
      }
    } catch (err) {
      console.error('Attendance error:', err)
      setError('Something went wrong. Please try again.')
      await loadOperativeAndAttendance(operative.id, projectId)
    } finally {
      setRecording(false)
    }
  }

  // Derive on-site status for this operative
  const isOnSite = attendance.length > 0 && attendance[0].type === 'sign_in'
  const lastRecord = attendance[0] || null
  const primaryColour = project?.primary_colour || '#1A2744'

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1A2744', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
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

  const companyName = project.company_name || ''

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
          @keyframes scaleIn { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes fadeInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
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
              {success.flag === 'late' && `⚠ Late arrival — start time is ${operative?.start_time || project?.start_time || '07:30'}`}
              {success.flag === 'early' && (isSignIn ? 'Early arrival' : `⚠ Early departure — end time is ${operative?.end_time || project?.end_time || '17:00'}`)}
              {success.flag === 'overtime' && `Overtime — end time is ${operative?.end_time || project?.end_time || '17:00'}`}
            </p>
          </div>
        )}
        {success.offSiteDistance && (
          <div style={{
            animation: 'fadeInUp 0.5s ease-out 0.5s forwards', opacity: 0, marginTop: 16,
            background: 'rgba(234,88,12,0.3)', borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <p style={{ color: '#fff', fontSize: 14, margin: 0, fontWeight: 600 }}>
              Off-site — you are {success.offSiteDistance}m from the project location
            </p>
          </div>
        )}
        {geoPosition && !success.offSiteDistance && (
          <div style={{ animation: 'fadeInUp 0.5s ease-out 0.5s forwards', opacity: 0, marginTop: 16, display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            <MapPin size={14} /> Location recorded
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

  // --- Authenticated: show sign in/out for this operative ---
  if (operative) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
        <div style={{ background: '#1A2744', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {project.logo_url ? (
              <img src={project.logo_url} alt="" style={{ height: 24, opacity: 0.8 }} />
            ) : (
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 300, letterSpacing: 1 }}>
                CORE<span style={{ fontWeight: 700 }}>SITE</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>{project.name}</p>
              {companyName && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>{companyName}</p>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 20px' }}>
          {operative.photo_url ? (
            <img src={operative.photo_url} alt={operative.name}
              style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', marginBottom: 16, border: '3px solid #e2e8f0' }} />
          ) : (
            <div style={{
              width: 100, height: 100, borderRadius: '50%', background: primaryColour,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 36, fontWeight: 700, marginBottom: 16,
            }}>
              {getInitials(operative.name)}
            </div>
          )}

          <h2 style={{ margin: '0 0 4px', fontSize: 24, color: '#1e293b', fontWeight: 700 }}>{operative.name}</h2>
          {operative.role && <p style={{ margin: '0 0 32px', color: '#64748b', fontSize: 15 }}>{operative.role}</p>}
          {!operative.role && <div style={{ height: 32 }} />}

          <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Error banner */}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
                onClick={() => setError(null)}>
                <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#991b1b', fontWeight: 600, flex: 1 }}>{error}</span>
                <span style={{ fontSize: 12, color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>Dismiss</span>
              </div>
            )}

            {/* Sign-out (already on site) */}
            {isOnSite && (
              <>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2EA043', boxShadow: '0 0 0 3px rgba(46,160,67,0.2)' }} />
                  <span style={{ fontSize: 15, color: '#166534', fontWeight: 600 }}>On site since {formatTime(lastRecord.recorded_at)}</span>
                </div>
                <input
                  type="text"
                  value={signOutNote}
                  onChange={e => setSignOutNote(e.target.value.slice(0, 500))}
                  placeholder="Leaving early or anything to note? (optional)"
                  style={{
                    width: '100%', padding: '12px 16px', fontSize: 14,
                    background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 10,
                    color: '#1e293b', outline: 'none', boxSizing: 'border-box',
                    marginBottom: 12,
                  }}
                />
                <button onClick={() => handleRecord('sign_out')} disabled={recording}
                  style={{
                    width: '100%', minHeight: 56, padding: '16px 24px',
                    background: '#DA3633', color: '#fff', border: 'none', borderRadius: 12,
                    fontSize: 18, fontWeight: 700, cursor: recording ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: recording ? 0.7 : 1, boxShadow: '0 2px 8px rgba(218,54,51,0.3)',
                  }}>
                  <LogOut size={22} /> SIGN OUT
                </button>
              </>
            )}
            {!isOnSite && (
              <>
                {lastRecord?.type === 'sign_out' && (
                  <div style={{ background: '#f5f5f5', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />
                    <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Last signed out at {formatTime(lastRecord.recorded_at)}</span>
                  </div>
                )}
                <input
                  type="text"
                  value={signInNote}
                  onChange={e => setSignInNote(e.target.value.slice(0, 500))}
                  placeholder="Running late or anything to note? (optional)"
                  style={{
                    width: '100%', padding: '12px 16px', fontSize: 14,
                    background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 10,
                    color: '#1e293b', outline: 'none', boxSizing: 'border-box',
                    marginBottom: 12,
                  }}
                />
                <button onClick={() => handleRecord('sign_in')} disabled={recording}
                  style={{
                    width: '100%', minHeight: 56, padding: '16px 24px',
                    background: '#2EA043', color: '#fff', border: 'none', borderRadius: 12,
                    fontSize: 18, fontWeight: 700, cursor: recording ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: recording ? 0.7 : 1, boxShadow: '0 2px 8px rgba(46,160,67,0.3)',
                  }}>
                  <LogIn size={22} /> SIGN IN
                </button>
              </>
            )}
          </div>

          {/* Not you? */}
          <button onClick={() => { removeSession('operative_session'); setOperative(null); setAttendance([]) }}
            style={{ marginTop: 24, background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Not {operative.name.split(' ')[0]}? Sign in as someone else
          </button>
        </div>
      </div>
    )
  }

  // --- Login screen ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1A2744' }}>
      <div style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
        {project.logo_url ? (
          <img src={project.logo_url} alt="" style={{ height: 28, opacity: 0.7 }} />
        ) : (
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 300, letterSpacing: 1 }}>
            CORE<span style={{ fontWeight: 700 }}>SITE</span>
          </div>
        )}
        <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '12px 0 2px' }}>{project.name}</h1>
        {companyName && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 }}>{companyName}</p>}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px 40px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.1)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <HardHat size={28} color="rgba(255,255,255,0.7)" />
          </div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 4px' }}>Site Sign-In</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', margin: '0 0 24px' }}>
            Log in with your worker account to sign in or out
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 12, position: 'relative' }}>
              <Mail size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email" value={email} onChange={e => { setEmail(e.target.value); setAuthError('') }}
                placeholder="Email address" autoComplete="email"
                style={{
                  width: '100%', padding: '14px 14px 14px 42px', fontSize: 15,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, color: '#fff', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 16, position: 'relative' }}>
              <Lock size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => { setPassword(e.target.value); setAuthError('') }}
                placeholder="Password" autoComplete="current-password"
                style={{
                  width: '100%', padding: '14px 44px 14px 42px', fontSize: 15,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, color: '#fff', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showPassword ? <EyeOff size={16} color="rgba(255,255,255,0.3)" /> : <Eye size={16} color="rgba(255,255,255,0.3)" />}
              </button>
            </div>

            <div
              onClick={() => setRememberMe(!rememberMe)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: rememberMe ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                background: rememberMe ? primaryColour : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}>
                {rememberMe && <Check size={14} color="#fff" strokeWidth={3} />}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Remember me on this device</span>
            </div>

            {authError && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>{authError}</p>}

            <button type="submit" disabled={authLoading}
              style={{
                width: '100%', padding: '14px 24px', fontSize: 16, fontWeight: 700,
                background: primaryColour, color: '#fff', border: 'none', borderRadius: 12,
                cursor: authLoading ? 'wait' : 'pointer', opacity: authLoading ? 0.7 : 1,
              }}>
              {authLoading ? 'Signing in...' : 'Sign In to Site'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>
            Powered by CoreSite
          </p>
        </div>
      </div>
    </div>
  )
}
