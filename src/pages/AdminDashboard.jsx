import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import {
  ArrowLeft, Users, Plus, Trash2, Edit3, Shield, FolderOpen,
  CheckCircle2, XCircle, Eye, EyeOff, LogOut, ChevronDown
} from 'lucide-react'
import { getSession, removeSession } from '../lib/storage'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [managers, setManagers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  // Add form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [selectedProjects, setSelectedProjects] = useState([])

  // Edit form
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editProjects, setEditProjects] = useState([])
  const [editActive, setEditActive] = useState(true)

  const cid = JSON.parse(getSession('manager_data') || '{}').company_id

  async function loadData() {
    setLoading(true)
    if (!cid) { setLoading(false); return }
    const [m, p] = await Promise.all([
      supabase.from('managers').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('projects').select('*').eq('company_id', cid).order('name'),
    ])
    setManagers(m.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }

  useEffect(() => {
    const mgr = getSession('manager_data')
    if (!mgr || JSON.parse(mgr).role !== 'admin') {
      navigate('/login')
      return
    }
    loadData() // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  async function addManager(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) return
    setSaving(true)
    const { error } = await supabase.from('managers').insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      role: 'manager',
      project_ids: selectedProjects,
      company_id: cid,
      is_active: true,
    })
    setSaving(false)
    if (error) {
      if (error.code === '23505') toast.error('Email already exists')
      else toast.error('Failed to add manager')
      return
    }
    toast.success('Manager account created')
    setShowAdd(false)
    setName(''); setEmail(''); setPassword(''); setSelectedProjects([])
    loadData()
  }

  async function updateManager(e) {
    e.preventDefault()
    if (!showEdit) return
    setSaving(true)
    const updates = {
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      project_ids: editProjects,
      is_active: editActive,
    }
    if (editPassword.trim()) updates.password = editPassword.trim()
    const { error } = await supabase.from('managers').update(updates).eq('id', showEdit.id)
    setSaving(false)
    if (error) {
      toast.error('Failed to update manager')
      return
    }
    toast.success('Manager updated')
    setShowEdit(null)
    loadData()
  }

  async function deleteManager(id, managerName) {
    if (!confirm(`Delete ${managerName}'s account? This cannot be undone.`)) return
    const { error } = await supabase.from('managers').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete manager')
      return
    }
    toast.success('Manager deleted')
    loadData()
  }

  function openEdit(mgr) {
    setEditName(mgr.name)
    setEditEmail(mgr.email)
    setEditPassword('')
    setEditProjects(mgr.project_ids || [])
    setEditActive(mgr.is_active !== false)
    setShowEdit(mgr)
  }

  function toggleProject(list, setList, projectId) {
    if (list.includes(projectId)) {
      setList(list.filter(id => id !== projectId))
    } else {
      setList([...list, projectId])
    }
  }

  function handleLogout() {
    removeSession('manager_data')
    removeSession('pm_auth')
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const managerCount = managers.filter(m => m.role !== 'admin').length
  const activeCount = managers.filter(m => m.role !== 'admin' && m.is_active).length

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/coresite-logo.svg" alt="CoreSite" className="h-8" />
          <div className="hidden sm:block">
            <p className="text-xs text-slate-400">Admin Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/pm')} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium">
            PM Dashboard
          </button>
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-700 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <Users size={18} className="text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{managerCount}</p>
            <p className="text-xs text-slate-400">Manager Accounts</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <CheckCircle2 size={18} className="text-green-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
            <p className="text-xs text-slate-400">Active</p>
          </div>
        </div>

        {/* Manager list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Manager Accounts</h2>
            <button onClick={() => { setShowAdd(true); setName(''); setEmail(''); setPassword(''); setSelectedProjects([]) }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus size={16} /> Add Manager
            </button>
          </div>

          <div className="space-y-2">
            {managers.map(mgr => {
              const assignedProjects = projects.filter(p => (mgr.project_ids || []).includes(p.id))
              const isAdmin = mgr.role === 'admin'
              return (
                <div key={mgr.id} className={`bg-white border rounded-xl p-4 ${mgr.is_active ? 'border-slate-200' : 'border-red-200 bg-red-50/30'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isAdmin ? 'bg-gradient-to-br from-amber-400 to-amber-500' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}>
                      {isAdmin ? <Shield size={18} className="text-white" /> : <span className="text-white font-bold text-sm">{mgr.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-900 font-semibold truncate">{mgr.name}</p>
                        {isAdmin && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">ADMIN</span>}
                        {!mgr.is_active && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">DISABLED</span>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{mgr.email}</p>
                      {!isAdmin && assignedProjects.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {assignedProjects.map(p => (
                            <span key={p.id} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{p.name}</span>
                          ))}
                        </div>
                      )}
                      {!isAdmin && assignedProjects.length === 0 && (
                        <p className="text-[11px] text-amber-500 mt-1">All projects (no restriction)</p>
                      )}
                    </div>
                    {!isAdmin && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(mgr)} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => deleteManager(mgr.id, mgr.name)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add Manager Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Manager">
        <form onSubmit={addManager} className="space-y-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            autoFocus
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent pr-12"
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {projects.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Assign to Projects (leave empty for all projects)</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 p-2 bg-navy-700 rounded-lg cursor-pointer hover:bg-navy-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(p.id)}
                      onChange={() => toggleProject(selectedProjects, setSelectedProjects, p.id)}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    <span className="text-sm text-white">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Create Account
          </LoadingButton>
        </form>
      </Modal>

      {/* Edit Manager Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit: ${showEdit?.name}`}>
        <form onSubmit={updateManager} className="space-y-4">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Full name"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="email"
            value={editEmail}
            onChange={e => setEditEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <div>
            <input
              type="text"
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              placeholder="New password (leave empty to keep current)"
              className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            />
          </div>

          <label className="flex items-center gap-3 p-3 bg-navy-700 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={editActive}
              onChange={e => setEditActive(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <div>
              <span className="text-sm text-white">Account Active</span>
              <p className="text-xs text-gray-500">Disabled accounts cannot log in</p>
            </div>
          </label>

          {projects.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Assigned Projects</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 p-2 bg-navy-700 rounded-lg cursor-pointer hover:bg-navy-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={editProjects.includes(p.id)}
                      onChange={() => toggleProject(editProjects, setEditProjects, p.id)}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    <span className="text-sm text-white">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Save Changes
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}
