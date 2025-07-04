import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Flag } from 'lucide-react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatDateRange } from '../utils/dateFormat'

interface PortfolioData {
  id: string
  title: string
  level: number
  wbsCode: string
  isMilestone: boolean
  startDate?: string
  endDate?: string
  projectId?: string
  project?: {
    id: string
    name: string
    client?: string
  }
  children: PortfolioData[]
  predecessors: any[]
  successors: any[]
}

interface Project {
  id: string
  name: string
  description: string
  startDate: string
  endDate: string
  status: string
  createdAt: string
  member?: {
    role: string
  }
}

const PortfolioView = () => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['portfolio-root']))
  const [projects, setProjects] = useState<Project[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    projectId: string
    projectName: string
  }>({ isOpen: false, projectId: '', projectName: '' })
  const [deleting, setDeleting] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPortfolioData()
    fetchProjects()
  }, [])

  const fetchPortfolioData = async () => {
    try {
      const response = await api.get('/portfolio/wbs')
      setPortfolioData(response.data)
    } catch (err: any) {
      console.error('Failed to fetch portfolio data:', err)
      setError('Failed to load portfolio data')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects')
      setProjects(response.data)
    } catch (err: any) {
      console.error('Failed to fetch projects:', err)
      setError('Failed to load projects')
    }
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`)
  }

  const handleDeleteClick = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmation({
      isOpen: true,
      projectId: project.id,
      projectName: project.name,
    })
  }

  const handleDeleteConfirm = async () => {
    const { projectId } = deleteConfirmation
    try {
      setDeleting(projectId)
      await api.delete(`/projects/${projectId}`)
      
      // Remove from projects list
      setProjects(prev => prev.filter(p => p.id !== projectId))
      
      // Refresh portfolio data to update WBS tree
      await fetchPortfolioData()
      
      setDeleteConfirmation({ isOpen: false, projectId: '', projectName: '' })
      setError('') // Clear any previous errors on successful deletion
    } catch (err: any) {
      console.error('Error deleting project:', err)
      let errorMessage = 'Failed to delete project'
      
      if (err.response?.status === 403) {
        errorMessage = 'Only project owners can delete projects'
      } else if (err.response?.status === 404) {
        errorMessage = 'Project not found'
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      }
      
      setError(errorMessage)
    } finally {
      setDeleting(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, projectId: '', projectName: '' })
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'planning':
        return 'bg-blue-100 text-blue-800'
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'on_hold':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleColor = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800'
      case 'PM':
        return 'bg-blue-100 text-blue-800'
      case 'VIEWER':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const renderNode = (node: PortfolioData, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children.length > 0
    const isProject = node.projectId && node.level === 1
    const project = projects.find(p => p.id === node.projectId)
    const isAdmin = project?.member?.role === 'ADMIN'

    return (
      <div key={node.id}>
        <div
          className={`flex items-center py-2 px-4 hover:bg-gray-50 ${
            isProject ? 'bg-blue-50 border-l-4 border-blue-500' : ''
          }`}
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleNode(node.id)}
              className="mr-2 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          {!hasChildren && <div className="w-6 mr-2" />}

          <div 
            className="flex items-center flex-1 cursor-pointer"
            onClick={() => isProject && node.projectId ? handleProjectClick(node.projectId) : undefined}
          >
            {isProject ? (
              <FolderOpen className="w-4 h-4 text-blue-600 mr-2" />
            ) : (
              <div className="w-4 h-4 mr-2" />
            )}
            
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-900">{node.title}</span>
                {node.isMilestone && (
                  <Flag className="w-3 h-3 text-yellow-600 ml-2" />
                )}
              </div>
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <span className="mr-3">WBS: {node.wbsCode}</span>
                {node.startDate && node.endDate && (
                  <span>
                    {formatDateRange(node.startDate, node.endDate)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Delete button for project nodes (only for admins) */}
          {isProject && isAdmin && project && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(project, e);
              }}
              disabled={deleting === project.id}
              className="ml-2 text-red-400 hover:text-red-600 p-1 rounded transition-colors disabled:opacity-50"
              title="Delete project"
            >
              {deleting === project.id ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-500"></div>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hierarchical view of all projects and their WBS structure
          </p>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hierarchical view of all projects and their WBS structure
          </p>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hierarchical view of all projects and their WBS structure
        </p>
      </div>

      {/* Portfolio WBS Tree */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Portfolio WBS
          </h3>
          <div className="space-y-1">
            {portfolioData ? (
              renderNode(portfolioData)
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No portfolio data</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create some projects to see them in the portfolio view.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new project.</p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/projects/new')}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-md transition-shadow relative"
              onClick={() => handleProjectClick(project.id)}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium text-gray-900 truncate">
                    {project.name}
                  </h3>
                  {project.member?.role === 'ADMIN' && (
                    <button
                      onClick={(e) => handleDeleteClick(project, e)}
                      disabled={deleting === project.id}
                      className="text-red-400 hover:text-red-600 p-1 rounded transition-colors disabled:opacity-50"
                      title="Delete project"
                    >
                      {deleting === project.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                  {project.description || 'No description provided'}
                </p>
                
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status?.replace('_', ' ') || 'Unknown'}
                  </span>
                  {project.member?.role && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(project.member.role)}`}>
                      {project.member.role}
                    </span>
                  )}
                </div>
                
                <div className="text-xs text-gray-500">
                  <div>Start: {formatDate(project.startDate)}</div>
                  <div>End: {formatDate(project.endDate)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-2">Delete Project</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete "{deleteConfirmation.projectName}"? 
                  This action cannot be undone and will permanently delete all tasks, relationships, and project data.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting === deleteConfirmation.projectId}
                  className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-24 mr-2 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting === deleteConfirmation.projectId ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
                  ) : (
                    'Delete'
                  )}
                </button>
                <button
                  onClick={handleDeleteCancel}
                  disabled={deleting === deleteConfirmation.projectId}
                  className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-24 hover:bg-gray-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PortfolioView 