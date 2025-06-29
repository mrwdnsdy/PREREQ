import React, { useState, useRef, useEffect } from 'react'
import { MoreVertical, Plus, Trash2, Edit3, ArrowRight } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WbsNode } from '../services/scheduleApi'

interface WbsTreeProps {
  nodes: WbsNode[]
  collapsedNodes: Set<string>
  onToggleCollapse: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<WbsNode>) => void
  onAddChild: (parentId: string) => void
  onAddSibling: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onSelectNode?: (nodeId: string) => void
  selectedNodeId?: string
  className?: string
}

interface SortableWbsNodeProps {
  node: WbsNode
  depth: number
  isCollapsed: boolean
  collapsedNodes: Set<string>
  selectedNodeId?: string
  onToggleCollapse: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<WbsNode>) => void
  onAddChild: (parentId: string) => void
  onAddSibling: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onSelectNode?: (nodeId: string) => void
  isSelected: boolean
}

// Function to get level icon based on level


const SortableWbsNode: React.FC<SortableWbsNodeProps> = ({
  node,
  depth,
  isCollapsed,
  collapsedNodes,
  selectedNodeId,
  onToggleCollapse,
  onUpdateNode,
  onAddChild,
  onAddSibling,
  onDeleteNode,
  onSelectNode,
  isSelected
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNameClick = () => {
    if (!isEditing) {
      setIsEditing(true)
      setEditValue(node.name)
    }
  }

  const handleNameSubmit = () => {
    if (editValue.trim() && editValue !== node.name) {
      onUpdateNode(node.id, { name: editValue.trim() })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNameSubmit()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(node.name)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const handleNodeClick = () => {
    onSelectNode?.(node.id)
  }

  const contextMenuItems = [
    ...(node.children.length > 0 ? [{
      label: isCollapsed ? 'Expand' : 'Collapse',
      icon: isCollapsed ? Plus : Edit3,
      onClick: () => {
        onToggleCollapse(node.id)
        setShowContextMenu(false)
      }
    }] : []),
    {
      label: node.level >= 10 ? 'Max depth reached (10 levels)' : `Add Child (Level ${node.level + 1})`,
      icon: Plus,
      onClick: () => {
        if (node.level >= 10) {
          alert('Maximum WBS depth of 10 levels reached. Cannot add more child levels.')
          setShowContextMenu(false)
          return
        }
        onAddChild(node.id)
        setShowContextMenu(false)
      },
      disabled: node.level >= 10
    },
    {
      label: `Add Sibling (Level ${node.level})`,
      icon: ArrowRight,
      onClick: () => {
        onAddSibling(node.id)
        setShowContextMenu(false)
      }
    },
    {
      label: 'Rename',
      icon: Edit3,
      onClick: () => {
        setIsEditing(true)
        setEditValue(node.name)
        setShowContextMenu(false)
      }
    },
    {
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        if (confirm(`Delete "${node.name}" and all its children?`)) {
          onDeleteNode(node.id)
        }
        setShowContextMenu(false)
      },
      className: 'text-red-600 hover:bg-red-50'
    }
  ]

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`
          flex items-center gap-2 py-1.5 pr-2 rounded hover:bg-sky-50 cursor-pointer select-none
          transition-colors duration-150 group relative
          ${isSelected ? 'bg-sky-50 border-l-2 border-sky-500' : ''}
          ${node.level === 9 ? 'border-l-2 border-amber-400' : ''}
          ${node.level === 10 ? 'border-l-2 border-red-400' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleNodeClick}
      >
        {/* 3-Dot Menu Button */}
        <div className="flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleContextMenu(e)
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors duration-150 opacity-60 group-hover:opacity-100"
            title="Options"
          >
            <MoreVertical className="w-3 h-3 text-gray-600" />
          </button>
        </div>

        {/* Level Number */}
        <div className="flex-shrink-0">
          <span 
            className={`
              inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold
              ${node.level === 1 ? 'bg-blue-100 text-blue-800' : ''}
              ${node.level === 2 ? 'bg-green-100 text-green-800' : ''}
              ${node.level === 3 ? 'bg-purple-100 text-purple-800' : ''}
              ${node.level === 4 ? 'bg-orange-100 text-orange-800' : ''}
              ${node.level === 5 ? 'bg-pink-100 text-pink-800' : ''}
              ${node.level === 6 ? 'bg-indigo-100 text-indigo-800' : ''}
              ${node.level === 7 ? 'bg-teal-100 text-teal-800' : ''}
              ${node.level === 8 ? 'bg-red-100 text-red-800' : ''}
              ${node.level === 9 ? 'bg-amber-100 text-amber-800' : ''}
              ${node.level === 10 ? 'bg-gray-100 text-gray-800' : ''}
            `}
            title={`Level ${node.level}`}
          >
            {node.level}
          </span>
        </div>

        {/* WBS Code - Drag Handle */}
        <div className="flex-shrink-0 min-w-[50px]">
          <span 
            className="text-xs text-gray-400 cursor-grab active:cursor-grabbing font-mono"
            {...attributes}
            {...listeners}
            title={`Level ${node.level} - Drag to reorder`}
          >
            {node.code}
          </span>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 text-sm border border-sky-500 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation()
                handleNameClick()
              }}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-150"
            >
              {node.name}
            </span>
          )}
        </div>


      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-gray-300 rounded-md shadow-lg z-50 py-1 min-w-32"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
        >
          {contextMenuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              disabled={item.disabled}
              className={`
                w-full px-3 py-2 text-left text-sm flex items-center gap-2
                transition-colors duration-150
                ${item.disabled 
                  ? 'text-gray-400 cursor-not-allowed' 
                  : `hover:bg-gray-50 ${item.className || 'text-gray-700'}`
                }
              `}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Children */}
      {!isCollapsed && node.children.length > 0 && (
        <SortableContext items={node.children.map(child => child.id)} strategy={verticalListSortingStrategy}>
          {node.children.map((child) => (
            <SortableWbsNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isCollapsed={collapsedNodes.has(child.id)}
              collapsedNodes={collapsedNodes}
              selectedNodeId={selectedNodeId}
              onToggleCollapse={onToggleCollapse}
              onUpdateNode={onUpdateNode}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onDeleteNode={onDeleteNode}
              onSelectNode={onSelectNode}
              isSelected={selectedNodeId === child.id}
            />
          ))}
        </SortableContext>
      )}
    </div>
  )
}

export const WbsTree: React.FC<WbsTreeProps> = ({
  nodes,
  collapsedNodes,
  onToggleCollapse,
  onUpdateNode,
  onAddChild,
  onAddSibling,
  onDeleteNode,
  onSelectNode,
  selectedNodeId,
  className = ''
}) => {
  
  const handleAddRoot = () => {
    // Create a new root level WBS node
    const newCode = `${nodes.length + 1}`
    onAddChild('') // Empty string for root level
  }
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      // Handle drag and drop reordering
      // This would need to be implemented based on your specific requirements
      console.log('Drag ended:', active.id, 'over:', over?.id)
    }
  }

  const flattenNodes = (nodes: WbsNode[]): WbsNode[] => {
    const result: WbsNode[] = []
    
    const traverse = (nodeList: WbsNode[], depth: number = 0) => {
      for (const node of nodeList) {
        result.push({ ...node, level: depth })
        if (!collapsedNodes.has(node.id) && node.children.length > 0) {
          traverse(node.children, depth + 1)
        }
      }
    }
    
    traverse(nodes)
    return result
  }

  const flatNodes = flattenNodes(nodes)

  return (
    <div className={`bg-white border-r border-gray-200 overflow-auto ${className}`} style={{ minWidth: '250px' }}>
      {/* Header with Add Root Button */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-3 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-700">WBS Structure</h3>
            <p className="text-xs text-gray-500">Maximum 10 levels</p>
          </div>
          <button
            onClick={handleAddRoot}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-md transition-colors duration-150 font-medium"
            title="Add Root Level Item"
          >
            <Plus className="w-4 h-4" />
            Add Root
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-2" style={{ minWidth: '220px' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={flatNodes.map(node => node.id)} strategy={verticalListSortingStrategy}>
            {nodes.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <div className="text-sm">No WBS items yet</div>
                <button
                  onClick={handleAddRoot}
                  className="mt-2 text-xs text-green-600 hover:text-green-700 underline"
                >
                  Add your first item
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {nodes.map((node) => (
                  <SortableWbsNode
                    key={node.id}
                    node={node}
                    depth={0}
                    isCollapsed={collapsedNodes.has(node.id)}
                    collapsedNodes={collapsedNodes}
                    selectedNodeId={selectedNodeId}
                    onToggleCollapse={onToggleCollapse}
                    onUpdateNode={onUpdateNode}
                    onAddChild={onAddChild}
                    onAddSibling={onAddSibling}
                    onDeleteNode={onDeleteNode}
                    onSelectNode={onSelectNode}
                    isSelected={selectedNodeId === node.id}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
} 