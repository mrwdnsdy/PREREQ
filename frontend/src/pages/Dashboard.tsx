import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, BarChart3, Calendar } from 'lucide-react'
import api from '../services/api'

interface Project {
  id: string
  name: string
  client?: string
  startDate: string
  endDate: string
  budget?: number
  _count: {
    tasks: number
  }
}

const Dashboard = () => {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects')
      return response.data
    },
  })

  const recentProjects = projects?.slice(0, 5) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome to PREREQ - Your Project Management Dashboard
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/projects"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <FolderOpen className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Projects</h3>
              <p className="text-sm text-gray-500">Manage your projects</p>
            </div>
          </div>
        </Link>

        <Link
          to="/portfolio"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Portfolio</h3>
              <p className="text-sm text-gray-500">View all projects</p>
            </div>
          </div>
        </Link>

        <Link
          to="/projects"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <Plus className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">New Project</h3>
              <p className="text-sm text-gray-500">Create a new project</p>
            </div>
          </div>
        </Link>

        <Link
          to="/projects"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Timeline</h3>
              <p className="text-sm text-gray-500">View project timeline</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Projects */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Projects</h2>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading projects...</p>
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new project.
              </p>
              <div className="mt-6">
                <Link
                  to="/projects"
                  className="btn btn-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
                      {project.client && (
                        <p className="text-sm text-gray-500">{project.client}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{project._count.tasks} tasks</p>
                      {project.budget && (
                        <p className="text-sm text-gray-500">${project.budget.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {projects && projects.length > 5 && (
                <div className="text-center pt-4">
                  <Link
                    to="/projects"
                    className="text-sm text-primary-600 hover:text-primary-500"
                  >
                    View all projects →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard 