import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import { buildBranding } from '../lib/reportTemplate'
import ProjectDocumentsSection from '../components/ProjectDocumentsSection'
import { ShieldCheck, ChevronRight } from 'lucide-react'

// Dedicated home for RAMS: everything uploaded here is a risk assessment /
// method statement by definition (doc_type='rams' on the shared `documents`
// table). Operatives sign through the same SignDocument flow as induction
// documents, and the H&S report RAMS register reads exactly this data.
export default function RiskAssessments() {
  const { company, user } = useCompany()
  const [projects, setProjects] = useState([])
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [operatives, setOperatives] = useState([])
  const [companyBranding, setCompanyBranding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProject, setExpandedProject] = useState(null)

  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const managerProjectIds = managerData.project_ids || []
  const isAdmin = managerData.role === 'admin' || managerData.role === 'super_admin'
  const cid = managerData.company_id || user?.company_id || company?.id

  const loadData = useCallback(async () => {
    if (!cid) { setLoading(false); return }
    const [pRes, dRes, sRes, oRes] = await Promise.all([
      supabase.from('projects').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('company_id', cid).eq('doc_type', 'rams').order('created_at', { ascending: false }),
      supabase.from('signatures').select('*').eq('company_id', cid).order('signed_at', { ascending: false }),
      supabase.from('operatives').select('id, operative_projects(project_id)').eq('company_id', cid).is('left_at', null),
    ])

    let filteredProjects = pRes.data || []
    if (!isAdmin && managerProjectIds.length > 0) {
      filteredProjects = filteredProjects.filter(p => managerProjectIds.includes(p.id))
    }
    const projectIds = new Set(filteredProjects.map(p => p.id))

    setProjects(filteredProjects)
    setDocuments((dRes.data || []).filter(d => projectIds.has(d.project_id)))
    setSignatures((sRes.data || []).filter(s => projectIds.has(s.project_id)))
    setOperatives(oRes.data || [])

    if (!companyBranding) {
      try {
        const { data: co } = await supabase.from('companies').select('name,logo_url,primary_colour,secondary_colour,settings').eq('id', cid).single()
        if (co) setCompanyBranding(buildBranding(co))
      } catch { /* ignore */ }
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <ShieldCheck size={22} style={{ color: 'var(--primary-color)' }} /> Risk Assessments
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          RAMS and method statements per project. Operatives sign them like any other document, and sign-off state feeds the RAMS register on the H&S report.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No projects yet — create one under All Projects first</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map(p => {
            const projDocs = documents.filter(d => d.project_id === p.id)
            const projOps = operatives.filter(o => (o.operative_projects || []).some(r => r.project_id === p.id))
            const projSigs = signatures.filter(s => s.project_id === p.id && !s.invalidated && projDocs.some(d => d.id === s.document_id))
            const totalSigsNeeded = projDocs.length * projOps.length
            const signOffPct = totalSigsNeeded > 0 ? Math.round((projSigs.length / totalSigsNeeded) * 100) : 0
            const expanded = expandedProject === p.id
            return (
              <div key={p.id} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <button onClick={() => setExpandedProject(expanded ? null : p.id)} className="w-full text-left p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</h3>
                      {p.location && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.location}</p>}
                    </div>
                    <ChevronRight size={18} className={`transition-transform shrink-0 ml-2 ${expanded ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{projDocs.length}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Risk Assessments</p>
                    </div>
                    <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{projSigs.length}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Signatures</p>
                    </div>
                    <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-main)' }}>
                      <p className={`text-lg font-bold ${signOffPct === 100 && totalSigsNeeded > 0 ? 'text-[#2EA043]' : ''}`} style={signOffPct < 100 || totalSigsNeeded === 0 ? { color: 'var(--text-primary)' } : {}}>{signOffPct}%</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sign-off</p>
                    </div>
                  </div>
                  {totalSigsNeeded > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-main)' }}>
                        <div className="h-full bg-[#2EA043] rounded-full transition-all" style={{ width: `${signOffPct}%` }} />
                      </div>
                    </div>
                  )}
                </button>

                {expanded && (
                  <div className="border-t p-5" style={{ borderColor: 'var(--border-color)' }}>
                    <ProjectDocumentsSection
                      project={p}
                      docs={projDocs}
                      signatures={signatures}
                      docType="rams"
                      heading="Risk Assessments"
                      emptyText="No risk assessments uploaded for this project"
                      companyBranding={companyBranding}
                      cid={cid}
                      onRefresh={loadData}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
