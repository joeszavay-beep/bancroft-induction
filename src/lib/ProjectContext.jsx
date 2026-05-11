import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useCompany } from './CompanyContext'

const ProjectContext = createContext(null)

const STORAGE_KEY = 'coresite_selected_project'

export function ProjectProvider({ children }) {
  const { user } = useCompany()
  const cid = user?.company_id

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProjectState] = useState(null) // full object or null
  const [loading, setLoading] = useState(true)

  // Load projects for this company
  useEffect(() => {
    if (!cid) return
    setLoading(true)
    supabase
      .from('projects')
      .select('id, name, location')
      .eq('company_id', cid)
      .order('name')
      .then(({ data }) => {
        const list = data || []
        setProjects(list)

        // Restore saved selection
        const savedId = localStorage.getItem(STORAGE_KEY)
        if (savedId) {
          const found = list.find(p => p.id === savedId)
          if (found) { setSelectedProjectState(found); setLoading(false); return }
        }

        // Auto-select first project if only one exists
        if (list.length === 1) {
          setSelectedProjectState(list[0])
          localStorage.setItem(STORAGE_KEY, list[0].id)
        }

        setLoading(false)
      })
  }, [cid])

  const setSelectedProject = useCallback((project) => {
    setSelectedProjectState(project)
    if (project) {
      localStorage.setItem(STORAGE_KEY, project.id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  // Refresh projects list (e.g. after adding a new project)
  const refreshProjects = useCallback(async () => {
    if (!cid) return
    const { data } = await supabase
      .from('projects')
      .select('id, name, location')
      .eq('company_id', cid)
      .order('name')
    setProjects(data || [])
  }, [cid])

  return (
    <ProjectContext.Provider value={{
      projects,
      selectedProject,
      projectId: selectedProject?.id || null,
      projectName: selectedProject?.name || null,
      setSelectedProject,
      refreshProjects,
      loading,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) return { projects: [], selectedProject: null, projectId: null, projectName: null, setSelectedProject: () => {}, refreshProjects: () => {}, loading: false }
  return ctx
}
