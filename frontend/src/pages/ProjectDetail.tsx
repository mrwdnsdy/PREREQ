import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Upload, Calendar, DollarSign, Users } from 'lucide-react'
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
  tasks: Task[]
}

interface Task {
  id: string
  title: string
  wbsCode: string
  level: number
  isMilestone: boolean
  startDate: string
  endDate: string
  parentId?: string
  children: Task[]
  predecessors: any[]
  successors: any[]
}

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>()

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get(`/projects/${id}`)
      return response.data
    },
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading project...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Project not found</h3>
        <p className="mt-1 text-sm text-gray-500">
          The project you're looking for doesn't exist.
        </p>
      </div>
    )
  }

  const renderTask = (task: Task, depth: number = 0) => (
    <div key={task.id} className="border-l-2 border-gray-200 ml-4">
      <div
        className="flex items-center py-2 px-4 hover:bg-gray-50"
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-900">{task.title}</span>
            {task.isMilestone && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Milestone
              </span>
            )}
          </div>
          <div className="flex items-center text-xs text-gray-500 mt-1">
            <span className="mr-3">WBS: {task.wbsCode}</span>
            <span>Level: {task.level}</span>
          </div>
        </div>
      </div>
      {task.children.map((child) => renderTask(child, depth + 1))}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="card">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.client && (
                <p className="text-lg text-gray-500 mt-1">{project.client}</p>
              )}
            </div>
            <div className="flex space-x-3">
              <button className="btn btn-secondary">
                <Upload className="w-4 h-4 mr-2" />
                Import P6
              </button>
              <button className="btn btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="w-4 h-4 mr-2" />
              <span>
                {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <Users className="w-4 h-4 mr-2" />
              <span>{project.members.length} members</span>
            </div>
            {project.budget && (
              <div className="flex items-center text-sm text-gray-500">
                <DollarSign className="w-4 h-4 mr-2" />
                <span>${project.budget.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project Members */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Project Members</h2>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {project.members.map((member) => (
              <div key={member.user.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.user.fullName || member.user.email}
                  </p>
                  <p className="text-sm text-gray-500">{member.user.email}</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WBS Structure */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Work Breakdown Structure</h2>
        </div>
        <div className="p-6">
          {project.tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No tasks defined yet.</p>
              <button className="mt-4 btn btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add First Task
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {project.tasks
                .filter(task => !task.parentId)
                .map(task => renderTask(task))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectDetail 