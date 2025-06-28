import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { WbsTree } from '../components/WbsTree'
import { TaskTable } from '../components/TaskTable'
import { useSchedule } from '../hooks/useSchedule'

const SchedulePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false)

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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Project Schedule
            </h1>
            <span className="text-sm text-gray-500">
              {projectId}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddWbs}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add WBS
            </button>
            
            <button
              onClick={handleAddTask}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="flex w-full max-w-7xl">
          {/* WBS Tree Sidebar */}
          <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${
            isTreeCollapsed ? 'w-12' : 'w-80'
          }`}>
            <div className="h-full flex flex-col">
              {/* Tree Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                {!isTreeCollapsed && (
                  <h2 className="text-sm font-medium text-gray-900">Work Breakdown Structure</h2>
                )}
                <button
                  onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors duration-150"
                >
                  {isTreeCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              </div>

              {/* Tree Content */}
              {!isTreeCollapsed && (
                <div className="flex-1 overflow-y-auto">
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
                      className="h-full"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Task Table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-6">
              <TaskTable
                tasks={tasks}
                allTasks={tasks}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                selectedTaskId={selectedTask}
                onSelectTask={setSelectedTask}
                onCircularError={handleCircularError}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SchedulePage 