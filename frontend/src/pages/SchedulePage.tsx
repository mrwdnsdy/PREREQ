import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, AlertCircle, ClipboardIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { WbsTree } from '../components/WbsTree'
import { TaskTable } from '../components/TaskTable'
import { useSchedule } from '../hooks/useSchedule'

const EmptyState: React.FC<{
  icon: React.ReactNode
  title: string
  actionText: string
  onAction: () => void
}> = ({ icon, title, actionText, onAction }) => (
  <div className="flex flex-col items-center justify-center py-12">
    {icon}
    <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
    <button
      onClick={onAction}
      className="mt-4 inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
    >
      {actionText}
    </button>
  </div>
)

const SchedulePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()

  const {
    wbsTree,
    tasks,
    isLoading,
    error,
    collapsedNodes,
    toggleCollapse,
    selectedTask,
    setSelectedTask,
    addWbsNode,
    updateWbsNode,
    deleteWbsNode,
    addTask,
    updateTask,
    deleteTask
  } = useSchedule(projectId || '')

  const handleAddWbs = () => {
    const newCode = `${wbsTree.length + 1}`
    addWbsNode({
      code: newCode,
      name: `New WBS Item ${newCode}`,
      level: 1,
      children: []
    })
  }

  const handleAddChild = (parentId: string) => {
    const parent = findWbsNode(wbsTree, parentId)
    if (parent) {
      const newCode = `${parent.code}.${parent.children.length + 1}`
      addWbsNode({
        code: newCode,
        name: `New Child Item`,
        parentId,
        level: parent.level + 1,
        children: []
      })
    }
  }

  const handleAddSibling = (nodeId: string) => {
    const node = findWbsNode(wbsTree, nodeId)
    if (node) {
      // Find parent and add sibling
      const parent = node.parentId ? findWbsNode(wbsTree, node.parentId) : null
      if (parent) {
        const newCode = `${parent.code}.${parent.children.length + 1}`
        addWbsNode({
          code: newCode,
          name: `New Sibling Item`,
          parentId: parent.id,
          level: parent.level + 1,
          children: []
        })
      } else {
        // Add root level sibling
        const newCode = `${wbsTree.length + 1}`
        addWbsNode({
          code: newCode,
          name: `New WBS Item ${newCode}`,
          level: 1,
          children: []
        })
      }
    }
  }

  const handleAddTask = () => {
    if (wbsTree.length === 0) {
      toast.error('Please add a WBS item first before creating tasks')
      return
    }

    // Use the first available WBS node if none selected
    const wbsNode = wbsTree[0]
    const taskCount = tasks.filter(t => t.wbsId === wbsNode.id).length + 1
    
    addTask({
      wbsId: wbsNode.id,
      wbsPath: wbsNode.code,
      name: `New Task ${taskCount}`,
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      predecessors: [],
      budget: 0,
      percentComplete: 0
    })
  }

  const handleCircularError = (message: string) => {
    toast.error(message)
  }

  const findWbsNode = (nodes: any[], nodeId: string): any => {
    for (const node of nodes) {
      if (node.id === nodeId) return node
      if (node.children) {
        const found = findWbsNode(node.children, nodeId)
        if (found) return found
      }
    }
    return null
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading schedule...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Schedule</h2>
          <p className="text-gray-600">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <main className="h-screen grid grid-rows-[auto_1fr]">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between border-b bg-white/80 backdrop-blur px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Project Schedule
          </h1>
          <span className="text-sm text-gray-500">
            {projectId}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddWbs}
            className="inline-flex items-center gap-1 rounded-md border border-sky-600 px-4 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-50 focus:ring-2 focus:ring-sky-500"
          >
            <Plus className="w-4 h-4" />
            Add WBS
          </button>
          
          <button
            onClick={handleAddTask}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="grid grid-cols-[280px_1fr] overflow-hidden max-md:grid-cols-1">
        <aside className="border-r overflow-y-auto bg-white max-md:hidden">
          {wbsTree.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">No WBS items yet.</p>
              <button
                onClick={handleAddWbs}
                className="mt-2 text-sm text-sky-600 hover:text-sky-700 font-medium"
              >
                Add your first WBS item
              </button>
            </div>
          ) : (
            <WbsTree
              nodes={wbsTree}
              collapsedNodes={collapsedNodes}
              onToggleCollapse={toggleCollapse}
              onUpdateNode={updateWbsNode}
              onAddChild={handleAddChild}
              onAddSibling={handleAddSibling}
              onDeleteNode={deleteWbsNode}
            />
          )}
        </aside>

        <section className="overflow-auto p-6">
          {tasks.length === 0 ? (
            <EmptyState
              icon={<ClipboardIcon className="h-10 w-10 text-gray-300" />}
              title="No tasks yet"
              actionText="+ Add Task"
              onAction={handleAddTask}
            />
          ) : (
            <TaskTable
              tasks={tasks}
              allTasks={tasks}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              selectedTaskId={selectedTask}
              onSelectTask={setSelectedTask}
              onCircularError={handleCircularError}
            />
          )}
        </section>
      </div>
    </main>
  )
}

export default SchedulePage 