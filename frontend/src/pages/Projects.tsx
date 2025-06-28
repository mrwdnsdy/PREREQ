import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Calendar, DollarSign, Users } from 'lucide-react'
import api from '../services/api'

interface Project {
  id: string
  name: string
  client?: string
  startDate: string
  endDate: string
  budget?: number
  members: Array<{
    user: {
      id: string
      email: string
      fullName?: string
    }
    role: string
  }>
  _count: {
    tasks: number
  }
}

const Projects = () => {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects')
      return response.data
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your projects and their tasks
          </p>
        </div>
        <Link
          to="/projects/new"
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading projects...</p>
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
                    {project.client && (
                      <p className="text-sm text-gray-500 mt-1">{project.client}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>
                      {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-500">
                      <Users className="w-4 h-4 mr-2" />
                      <span>{project.members.length} members</span>
                    </div>
                    <div className="flex items-center text-gray-500">
                      <span>{project._count.tasks} tasks</span>
                    </div>
                  </div>

                  {project.budget && (
                    <div className="flex items-center text-sm text-gray-500">
                      <DollarSign className="w-4 h-4 mr-2" />
                      <span>${project.budget.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <Plus className="h-12 w-12" />
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new project.
          </p>
          <div className="mt-6">
            <Link
              to="/projects/new"
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default Projects 