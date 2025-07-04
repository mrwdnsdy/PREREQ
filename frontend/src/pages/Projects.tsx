import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

interface ProjectMember {
  id: string
  role: string
  user: {
    id: string
    email: string
    fullName: string
  }
}

interface Project {
  id: string
  name: string
  client: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
  budget?: number
  budgetRollup?: number
  members: ProjectMember[]
  _count?: {
    tasks: number
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800'
    case 'completed':
      return 'bg-blue-100 text-blue-800'
    case 'on-hold':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-800'
    case 'ADMIN':
      return 'bg-blue-100 text-blue-800'
    case 'MEMBER':
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const Projects = () => {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await api.get('/projects')
      setProjects(response.data)
    } catch (err: any) {
      console.error('Error fetching projects:', err)
      setError(err.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      setDeletingProjectId(projectId)
      await api.delete(`/projects/${projectId}`)
      setProjects(projects.filter(p => p.id !== projectId))
    } catch (err: any) {
      console.error('Error deleting project:', err)
      alert('Failed to delete project: ' + (err.message || 'Unknown error'))
    } finally {
      setDeletingProjectId(null)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-base text-gray-600 mb-4">Please log in to view your projects.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-base font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
            <p className="mt-4 text-base text-gray-500">Loading projects...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Projects</h2>
            <p className="text-base text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchProjects}
              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-base font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="mt-1 text-base text-gray-500">
              Manage and organize your projects
            </p>
          </div>
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-base font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
          >
            <Plus className="h-5 w-5" />
            New Project
          </Link>
        </div>

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No projects</h3>
            <p className="mt-1 text-base text-gray-500">
              Get started by creating your first project.
            </p>
            <div className="mt-6">
              <Link
                to="/projects/new"
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-base font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                <Plus className="mr-1.5 h-5 w-5" />
                New Project
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const userMember = project.members?.find(m => m.user.id === user?.id)
              const canDelete = userMember?.role === 'OWNER'

              return (
                <div
                  key={project.id}
                  className="relative rounded-lg border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
                >
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDeleteProject(project.id)
                      }}
                      disabled={deletingProjectId === project.id}
                      className="absolute top-4 right-4 text-red-400 hover:text-red-600 p-1 rounded transition-colors disabled:opacity-50 z-10"
                      title="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  <Link 
                    to={`/projects/${project.id}`}
                    className="block p-6 h-full"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1 mr-8">
                        <h3 className="text-lg font-medium text-gray-900 truncate">
                          {project.name}
                        </h3>
                        
                        {project.client && (
                          <p className="text-base text-gray-500 mb-3 line-clamp-2">
                            {project.client}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800`}>
                            Active
                          </span>
                          {userMember && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getRoleColor(userMember.role)}`}>
                              {userMember.role}
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-gray-500 mt-3">
                          <p>{project._count?.tasks || 0} tasks</p>
                          <p>Created {new Date(project.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Projects 