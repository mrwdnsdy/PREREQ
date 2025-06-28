import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import api from '../services/api'

interface Task {
  id: string
  title: string
  wbsCode: string
}

interface Relation {
  id: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lag: number
  predecessor: Task
  successor: Task
}

interface RelationDrawerProps {
  isOpen: boolean
  onClose: () => void
  taskId: string
  taskTitle: string
  availableTasks: Task[]
  relations: Relation[]
  onRelationsChange: () => void
}

const RelationDrawer: React.FC<RelationDrawerProps> = ({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  availableTasks,
  relations,
  onRelationsChange,
}) => {
  const [newRelation, setNewRelation] = useState({
    successorId: '',
    type: 'FS' as const,
    lag: 0,
  })

  const handleCreateRelation = async () => {
    try {
      await api.post(`/tasks/${taskId}/relations`, newRelation)
      setNewRelation({ successorId: '', type: 'FS', lag: 0 })
      onRelationsChange()
    } catch (error) {
      console.error('Failed to create relation:', error)
    }
  }

  const handleDeleteRelation = async (relationId: string) => {
    try {
      await api.delete(`/tasks/${taskId}/relations/${relationId}`)
      onRelationsChange()
    } catch (error) {
      console.error('Failed to delete relation:', error)
    }
  }

  const formatLag = (lag: number) => {
    if (lag === 0) return 'No lag'
    const absLag = Math.abs(lag)
    const hours = Math.floor(absLag / 60)
    const minutes = absLag % 60
    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    return lag > 0 ? `+${timeStr}` : `-${timeStr}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-md">
            <div className="h-full flex flex-col bg-white shadow-xl">
              <div className="px-4 py-6 bg-primary-700 sm:px-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-white">Task Relations</h2>
                  <button
                    onClick={onClose}
                    className="text-primary-200 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
                <p className="mt-1 text-sm text-primary-300">{taskTitle}</p>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-6 space-y-6">
                  {/* Create new relation */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Add Relation</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Successor Task
                        </label>
                        <select
                          value={newRelation.successorId}
                          onChange={(e) => setNewRelation({ ...newRelation, successorId: e.target.value })}
                          className="mt-1 input"
                        >
                          <option value="">Select a task</option>
                          {availableTasks
                            .filter(task => task.id !== taskId)
                            .map(task => (
                              <option key={task.id} value={task.id}>
                                {task.wbsCode} - {task.title}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Relation Type
                        </label>
                        <select
                          value={newRelation.type}
                          onChange={(e) => setNewRelation({ ...newRelation, type: e.target.value as any })}
                          className="mt-1 input"
                        >
                          <option value="FS">Finish to Start (FS)</option>
                          <option value="SS">Start to Start (SS)</option>
                          <option value="FF">Finish to Finish (FF)</option>
                          <option value="SF">Start to Finish (SF)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Lag (minutes)
                        </label>
                        <input
                          type="number"
                          value={newRelation.lag}
                          onChange={(e) => setNewRelation({ ...newRelation, lag: parseInt(e.target.value) || 0 })}
                          className="mt-1 input"
                          placeholder="0"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Positive = delay, Negative = lead
                        </p>
                      </div>

                      <button
                        onClick={handleCreateRelation}
                        disabled={!newRelation.successorId}
                        className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Relation
                      </button>
                    </div>
                  </div>

                  {/* Existing relations */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Existing Relations</h3>
                    {relations.length === 0 ? (
                      <p className="text-sm text-gray-500">No relations defined</p>
                    ) : (
                      <div className="space-y-3">
                        {relations.map((relation) => (
                          <div key={relation.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {relation.successor.wbsCode} - {relation.successor.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                {relation.type} • {formatLag(relation.lag)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeleteRelation(relation.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RelationDrawer 