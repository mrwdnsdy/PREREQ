import React from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Plus, BarChart3, Calendar } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useEffect, useState } from 'react'
import api from '../services/api'

interface Project {
  id: string
  name: string
  client: string
  taskCount: number
  createdAt: string
}

const Dashboard = () => {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await api.get('/projects')
        setProjects(response.data.slice(0, 3)) // Show only 3 recent projects
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [])

  const quickActions = [
    {
      title: 'Projects',
      description: 'Manage your projects',
      icon: FolderOpen,
      href: '/projects',
      color: 'text-primary-600'
    },
    {
      title: 'Portfolio',
      description: 'View all projects',
      icon: BarChart3,
      href: '/portfolio',
      color: 'text-primary-600'
    },
    {
      title: 'New Project',
      description: 'Create a new project',
      icon: Plus,
      href: '/projects/new',
      color: 'text-primary-600'
    },
    {
      title: 'Timeline',
      description: 'View project timeline',
      icon: Calendar,
      href: '/timeline',
      color: 'text-primary-600'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-base text-gray-500">
          Welcome back, {user?.fullName}
        </p>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.href}
              className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 hover:shadow-md transition-all"
            >
              <div>
                <action.icon className={`h-8 w-8 ${action.color}`} />
              </div>
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900">{action.title}</h3>
                <p className="text-base text-gray-500">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent Projects */}
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900">Recent Projects</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-base text-gray-500">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-base font-medium text-gray-900">No projects</h3>
              <p className="mt-1 text-base text-gray-500">
                Get started by creating your first project.
              </p>
              <div className="mt-6">
                <Link
                  to="/projects/new"
                  className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-base font-semibold text-white shadow-sm hover:bg-primary-700"
                >
                  <Plus className="mr-1.5 h-5 w-5" />
                  New Project
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="block relative rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-medium text-gray-900">{project.name}</h3>
                      {project.client && (
                        <p className="text-base text-gray-500">{project.client}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-base text-gray-900">{project.taskCount} tasks</p>
                    </div>
                  </div>
                </Link>
              ))}
              
              <div className="text-center pt-4">
                <Link
                  to="/projects"
                  className="text-base text-primary-600 hover:text-primary-500"
                >
                  View all projects →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard 