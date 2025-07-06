import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

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

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    setShowDeleteConfirm(projectId)
  }

  const confirmDelete = async (projectId: string) => {
    try {
      setDeletingProjectId(projectId)
      setShowDeleteConfirm(null)
      await api.delete(`/projects/${projectId}`)
      setProjects(projects.filter(p => p.id !== projectId))
      toast.success('Project deleted successfully')
    } catch (err: any) {
      console.error('Error deleting project:', err)
      toast.error('Failed to delete project: ' + (err.response?.data?.message || err.message || 'Unknown error'))
    } finally {
      setDeletingProjectId(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(null)
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
              // Show delete button for all users for now to test visibility
              const canDelete = true // userMember?.role === 'OWNER' || userMember?.role === 'ADMIN'
              const hasPermission = userMember?.role === 'OWNER' || userMember?.role === 'ADMIN'

              return (
                <div
                  key={project.id}
                  className="relative rounded-lg border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
                >
                  {/* Delete Button - More visible with background */}
                  <div className="absolute top-3 right-3 z-10">
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (hasPermission) {
                          handleDeleteProject(project.id, project.name)
                        } else {
                          toast.error('You do not have permission to delete this project')
                        }
                      }}
                      disabled={deletingProjectId === project.id}
                      className={`p-2 rounded-full border shadow-sm transition-all ${
                        hasPermission 
                          ? 'text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 bg-white' 
                          : 'text-gray-400 border-gray-200 cursor-not-allowed bg-gray-50'
                      } disabled:opacity-50`}
                      title={hasPermission ? "Delete project" : "No permission to delete"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <Link 
                    to={`/projects/${project.id}`}
                    className="block p-6 h-full"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1 mr-12">
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

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">Delete Project</h3>
                <div className="mt-2 px-7 py-3">
                  <p className="text-sm text-gray-500">
                    Are you sure you want to delete this project? This action cannot be undone and will permanently remove all project data including tasks, dependencies, and resources.
                  </p>
                </div>
                <div className="items-center px-4 py-3">
                  <button
                    onClick={() => confirmDelete(showDeleteConfirm)}
                    disabled={deletingProjectId === showDeleteConfirm}
                    className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-24 mr-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                  >
                    {deletingProjectId === showDeleteConfirm ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={cancelDelete}
                    disabled={deletingProjectId === showDeleteConfirm}
                    className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-24 hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Projects 