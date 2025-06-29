import React, { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, MoreVertical, Plus, Trash2, Edit3 } from 'lucide-react'
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
  onToggleCollapse: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<WbsNode>) => void
  onAddChild: (parentId: string) => void
  onAddSibling: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onSelectNode?: (nodeId: string) => void
  isSelected: boolean
}

const SortableWbsNode: React.FC<SortableWbsNodeProps> = ({
  node,
  depth,
  isCollapsed,
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
    {
      label: 'Add Child',
      icon: Plus,
      onClick: () => {
        onAddChild(node.id)
        setShowContextMenu(false)
      }
    },
    {
      label: 'Add Sibling',
      icon: Plus,
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
        onDeleteNode(node.id)
        setShowContextMenu(false)
      },
      className: 'text-red-600 hover:bg-red-50'
    }
  ]

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`
          flex items-center gap-1 py-1 pr-2 rounded hover:bg-sky-50 cursor-pointer select-none
          transition-colors duration-150 group
          ${isSelected ? 'bg-sky-50 border-l-2 border-sky-500' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleNodeClick}
        onContextMenu={handleContextMenu}
        {...attributes}
        {...listeners}
      >
        {/* Chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse(node.id)
          }}
          className="p-0.5 hover:bg-gray-200 rounded transition-colors duration-150"
          style={{ visibility: node.children.length > 0 ? 'visible' : 'hidden' }}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* WBS Code */}
        <span className="text-xs text-gray-400">
          {node.code}
        </span>

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

        {/* Context Menu Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleContextMenu(e)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all duration-150"
        >
          <MoreVertical className="w-4 h-4 text-gray-500" />
        </button>
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
              className={`
                w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2
                transition-colors duration-150
                ${item.className || 'text-gray-700'}
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
              isCollapsed={false} // Will be handled by parent's collapsed state
              onToggleCollapse={onToggleCollapse}
              onUpdateNode={onUpdateNode}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onDeleteNode={onDeleteNode}
              onSelectNode={onSelectNode}
              isSelected={isSelected}
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
    <div className={`bg-white border-r border-gray-200 overflow-y-auto ${className}`}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={flatNodes.map(node => node.id)} strategy={verticalListSortingStrategy}>
          {nodes.map((node) => (
            <SortableWbsNode
              key={node.id}
              node={node}
              depth={0}
              isCollapsed={collapsedNodes.has(node.id)}
              onToggleCollapse={onToggleCollapse}
              onUpdateNode={onUpdateNode}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onDeleteNode={onDeleteNode}
              onSelectNode={onSelectNode}
              isSelected={selectedNodeId === node.id}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
} 