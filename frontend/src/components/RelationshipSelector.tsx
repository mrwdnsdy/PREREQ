import React, { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { Task } from '../hooks/useTasks'

// Task relation interface that matches what useTasks expects
interface TaskRelation {
  id: string
  predecessorId: string
  type: string
  lag: number
  predecessor: {
    id: string
    name: string
    wbsPath: string
  }
}

interface RelationshipSelectorProps {
  value: TaskRelation[]
  onChange: (relations: TaskRelation[]) => void
  availableTasks: Task[]
  currentTaskId: string
  onCircularError?: (error: string) => void
  className?: string
}

const relationTypes = [
  { value: 'FS', label: 'FS', description: 'Finish-to-Start' },
  { value: 'SS', label: 'SS', description: 'Start-to-Start' },
  { value: 'FF', label: 'FF', description: 'Finish-to-Finish' },
  { value: 'SF', label: 'SF', description: 'Start-to-Finish' }
] as const

export const RelationshipSelector: React.FC<RelationshipSelectorProps> = ({
  value,
  onChange,
  availableTasks,
  currentTaskId,
  onCircularError,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRelationType, setSelectedRelationType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter available tasks (exclude current task and already selected)
  const filteredTasks = availableTasks.filter(task => {
    if (task.id === currentTaskId) return false
    if (value.some(rel => rel.predecessorId === task.id)) return false
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      return (
        task.name.toLowerCase().includes(searchLower) ||
        task.wbsPath.toLowerCase().includes(searchLower)
      )
    }
    return true
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addRelation = (task: Task) => {
    const newRelation: TaskRelation = {
      id: `rel-${Date.now()}`,
      predecessorId: task.id,
      type: selectedRelationType,
      lag: 0,
      predecessor: {
        id: task.id,
        name: task.name,
        wbsPath: task.wbsPath
      }
    }

    // Check for circular dependency (basic check - could be enhanced)
    const wouldCreateCycle = value.some(rel => rel.predecessorId === currentTaskId)
    if (wouldCreateCycle) {
      onCircularError?.('Adding this predecessor would create a circular dependency')
      return
    }

    onChange([...value, newRelation])
    setSearchTerm('')
    setIsOpen(false)
  }

  const removeRelation = (relationId: string) => {
    onChange(value.filter(rel => rel.id !== relationId))
  }

  const updateRelationType = (relationId: string, newType: 'FS' | 'SS' | 'FF' | 'SF') => {
    onChange(value.map(rel => 
      rel.id === relationId ? { ...rel, type: newType } : rel
    ))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTasks.length > 0) {
      e.preventDefault()
      addRelation(filteredTasks[0])
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchTerm('')
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Selected Relations Pills */}
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((relation) => (
          <div
            key={relation.id}
            className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 group"
          >
            <span className="font-medium">{relation.predecessor.wbsPath}</span>
            
            {/* Relation Type Toggle */}
            <select
              value={relation.type}
              onChange={(e) => updateRelationType(relation.id, e.target.value as any)}
              className="bg-transparent border-0 text-xs font-bold text-sky-900 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {relationTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => removeRelation(relation.id)}
              className="text-sky-600 hover:text-sky-800 transition-colors duration-150 opacity-0 group-hover:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add New Relation */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <select
            value={selectedRelationType}
            onChange={(e) => setSelectedRelationType(e.target.value as any)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          >
            {relationTypes.map(type => (
              <option key={type.value} value={type.value} title={type.description}>
                {type.label}
              </option>
            ))}
          </select>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Add predecessor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">
                {searchTerm ? 'No matching tasks found' : 'No available predecessors'}
              </div>
            ) : (
              filteredTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => addRelation(task)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors duration-150"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900 text-xs">{task.wbsPath}</span>
                      <span className="ml-2 text-gray-600 text-xs">{task.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {task.startDate} - {task.endDate}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
} 