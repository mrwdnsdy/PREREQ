import React, { useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Edit2, 
  Trash2, 
  Clock,
  ArrowRight,
  Save
} from 'lucide-react';
import { Task } from '../hooks/useTasks';
import { useDependencies, useTaskDependencies } from '../hooks/useDependencies';
import { 
  DependencyType, 
  CreateDependencyRequest, 
  UpdateDependencyRequest,
  TaskDependency
} from '../services/dependenciesApi';

interface DependenciesPanelProps {
  selectedTask: Task | null;
  allTasks: Task[];
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}

interface EditingDependency {
  id: string;
  type: DependencyType;
  lag: number;
}

export const DependenciesPanel: React.FC<DependenciesPanelProps> = ({
  selectedTask,
  allTasks,
  projectId,
  isOpen,
  onClose,
  onToggleCollapse,
  isCollapsed
}) => {
  const [isAddingPredecessor, setIsAddingPredecessor] = useState(false);
  const [isAddingSuccessor, setIsAddingSuccessor] = useState(false);
  const [editingDependency, setEditingDependency] = useState<EditingDependency | null>(null);
  
  // New dependency form state
  const [newDependency, setNewDependency] = useState<{
    taskId: string;
    type: DependencyType;
    lag: number;
    isPredecessor: boolean;
  }>({
    taskId: '',
    type: DependencyType.FS,
    lag: 0,
    isPredecessor: true
  });

  const { 
    createDependency, 
    updateDependency, 
    deleteDependency,
    isCreating,
    isUpdating,
    isDeleting
  } = useDependencies(projectId);

  const { 
    taskDependencies, 
    isLoading: isLoadingDependencies 
  } = useTaskDependencies(selectedTask?.id || null);

  // Available tasks for selection (excluding the selected task)
  const availableTasks = allTasks.filter(task => 
    task.id !== selectedTask?.id && !task.isHeader
  );

  const handleCreateDependency = async () => {
    if (!selectedTask || !newDependency.taskId) return;

    const dependency: CreateDependencyRequest = newDependency.isPredecessor
      ? {
          predecessorId: newDependency.taskId,
          successorId: selectedTask.id,
          type: newDependency.type,
          lag: newDependency.lag
        }
      : {
          predecessorId: selectedTask.id,
          successorId: newDependency.taskId,
          type: newDependency.type,
          lag: newDependency.lag
        };

    try {
      await createDependency(dependency);
      // Reset form
      setNewDependency({
        taskId: '',
        type: DependencyType.FS,
        lag: 0,
        isPredecessor: true
      });
      setIsAddingPredecessor(false);
      setIsAddingSuccessor(false);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleUpdateDependency = async () => {
    if (!editingDependency) return;

    const updates: UpdateDependencyRequest = {
      type: editingDependency.type,
      lag: editingDependency.lag
    };

    try {
      await updateDependency(editingDependency.id, updates);
      setEditingDependency(null);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleDeleteDependency = async (dependencyId: string) => {
    if (window.confirm('Are you sure you want to delete this dependency?')) {
      try {
        await deleteDependency(dependencyId);
      } catch (error) {
        // Error handling is done in the hook
      }
    }
  };

  const startEditing = (dependency: TaskDependency) => {
    setEditingDependency({
      id: dependency.id,
      type: dependency.type,
      lag: dependency.lag
    });
  };

  const cancelEditing = () => {
    setEditingDependency(null);
  };

  const getDependencyTypeLabel = (type: DependencyType): string => {
    switch (type) {
      case DependencyType.FS: return 'Finish-to-Start';
      case DependencyType.SS: return 'Start-to-Start';
      case DependencyType.FF: return 'Finish-to-Finish';
      case DependencyType.SF: return 'Start-to-Finish';
      default: return type;
    }
  };

  const getDependencyTypeColor = (type: DependencyType): string => {
    switch (type) {
      case DependencyType.FS: return 'text-blue-600 bg-blue-50';
      case DependencyType.SS: return 'text-green-600 bg-green-50';
      case DependencyType.FF: return 'text-purple-600 bg-purple-50';
      case DependencyType.SF: return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-lg transition-all duration-300 z-40 ${
      isCollapsed ? 'w-12' : 'w-96'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        {!isCollapsed && (
          <>
            <h3 className="text-lg font-semibold text-gray-900">Dependencies</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleCollapse}
                className="p-1 hover:bg-gray-200 rounded"
                title="Collapse panel"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded"
                title="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
        {isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-gray-200 rounded w-full flex justify-center"
            title="Expand panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-4 overflow-y-auto h-full pb-20">
          {!selectedTask ? (
            <div className="text-center text-gray-500 py-8">
              <ArrowRight className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>Select a task to view its dependencies</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Task Info */}
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-1">Selected Task</h4>
                <p className="text-sm text-blue-700">
                  {selectedTask.activityId && (
                    <span className="font-mono bg-blue-100 px-2 py-1 rounded mr-2">
                      {selectedTask.activityId}
                    </span>
                  )}
                  {selectedTask.title || selectedTask.name}
                </p>
              </div>

              {/* Loading state */}
              {isLoadingDependencies && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading dependencies...</p>
                </div>
              )}

              {/* Predecessors Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium text-gray-900">Predecessors</h5>
                  <button
                    onClick={() => {
                      setIsAddingPredecessor(true);
                      setNewDependency(prev => ({ ...prev, isPredecessor: true }));
                    }}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                    disabled={isCreating}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>

                {/* Add Predecessor Form */}
                {isAddingPredecessor && (
                  <div className="bg-gray-50 p-3 rounded border space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Predecessor Task
                      </label>
                      <select
                        value={newDependency.taskId}
                        onChange={(e) => setNewDependency(prev => ({ ...prev, taskId: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select a task...</option>
                        {availableTasks.map(task => (
                          <option key={task.id} value={task.id}>
                            {task.activityId ? `${task.activityId} - ` : ''}{task.title || task.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Type
                        </label>
                        <select
                          value={newDependency.type}
                          onChange={(e) => setNewDependency(prev => ({ ...prev, type: e.target.value as DependencyType }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                          <option value={DependencyType.FS}>FS - Finish-to-Start</option>
                          <option value={DependencyType.SS}>SS - Start-to-Start</option>
                          <option value={DependencyType.FF}>FF - Finish-to-Finish</option>
                          <option value={DependencyType.SF}>SF - Start-to-Finish</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Lag (days)
                        </label>
                        <input
                          type="number"
                          value={newDependency.lag}
                          onChange={(e) => setNewDependency(prev => ({ ...prev, lag: parseInt(e.target.value) || 0 }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                          min="-365"
                          max="365"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateDependency}
                        disabled={!newDependency.taskId || isCreating}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {isCreating ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => setIsAddingPredecessor(false)}
                        className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Predecessors List */}
                <div className="space-y-2">
                  {taskDependencies?.asSuccessor?.map(dependency => (
                    <div key={dependency.id} className="border border-gray-200 rounded p-3 bg-white">
                      {editingDependency?.id === dependency.id ? (
                        // Edit form
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Type
                              </label>
                              <select
                                value={editingDependency.type}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, type: e.target.value as DependencyType }) : null)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                <option value={DependencyType.FS}>FS</option>
                                <option value={DependencyType.SS}>SS</option>
                                <option value={DependencyType.FF}>FF</option>
                                <option value={DependencyType.SF}>SF</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Lag (days)
                              </label>
                              <input
                                type="number"
                                value={editingDependency.lag}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, lag: parseInt(e.target.value) || 0 }) : null)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                min="-365"
                                max="365"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleUpdateDependency}
                              disabled={isUpdating}
                              className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <Save className="h-3 w-3" />
                              {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors flex items-center gap-1"
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Display mode
                        <div>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-gray-900">
                                {dependency.predecessor.wbsCode && (
                                  <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-2 text-xs">
                                    {dependency.predecessor.wbsCode}
                                  </span>
                                )}
                                {dependency.predecessor.title}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => startEditing(dependency)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Edit dependency"
                              >
                                <Edit2 className="h-3 w-3 text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteDependency(dependency.id)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Delete dependency"
                                disabled={isDeleting}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded font-medium ${getDependencyTypeColor(dependency.type)}`}>
                              {dependency.type}
                            </span>
                            {dependency.lag !== 0 && (
                              <span className="flex items-center gap-1 text-gray-600">
                                <Clock className="h-3 w-3" />
                                {dependency.lag > 0 ? `+${dependency.lag}` : dependency.lag} days
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )) || []}

                  {(!taskDependencies?.asSuccessor || taskDependencies.asSuccessor.length === 0) && !isAddingPredecessor && (
                    <p className="text-sm text-gray-500 text-center py-2">No predecessors</p>
                  )}
                </div>
              </div>

              {/* Successors Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium text-gray-900">Successors</h5>
                  <button
                    onClick={() => {
                      setIsAddingSuccessor(true);
                      setNewDependency(prev => ({ ...prev, isPredecessor: false }));
                    }}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                    disabled={isCreating}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>

                {/* Add Successor Form */}
                {isAddingSuccessor && (
                  <div className="bg-gray-50 p-3 rounded border space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Successor Task
                      </label>
                      <select
                        value={newDependency.taskId}
                        onChange={(e) => setNewDependency(prev => ({ ...prev, taskId: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select a task...</option>
                        {availableTasks.map(task => (
                          <option key={task.id} value={task.id}>
                            {task.activityId ? `${task.activityId} - ` : ''}{task.title || task.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Type
                        </label>
                        <select
                          value={newDependency.type}
                          onChange={(e) => setNewDependency(prev => ({ ...prev, type: e.target.value as DependencyType }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                          <option value={DependencyType.FS}>FS - Finish-to-Start</option>
                          <option value={DependencyType.SS}>SS - Start-to-Start</option>
                          <option value={DependencyType.FF}>FF - Finish-to-Finish</option>
                          <option value={DependencyType.SF}>SF - Start-to-Finish</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Lag (days)
                        </label>
                        <input
                          type="number"
                          value={newDependency.lag}
                          onChange={(e) => setNewDependency(prev => ({ ...prev, lag: parseInt(e.target.value) || 0 }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                          min="-365"
                          max="365"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateDependency}
                        disabled={!newDependency.taskId || isCreating}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {isCreating ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => setIsAddingSuccessor(false)}
                        className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Successors List */}
                <div className="space-y-2">
                  {taskDependencies?.asPredecessor?.map(dependency => (
                    <div key={dependency.id} className="border border-gray-200 rounded p-3 bg-white">
                      {editingDependency?.id === dependency.id ? (
                        // Edit form (same as above)
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Type
                              </label>
                              <select
                                value={editingDependency.type}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, type: e.target.value as DependencyType }) : null)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                <option value={DependencyType.FS}>FS</option>
                                <option value={DependencyType.SS}>SS</option>
                                <option value={DependencyType.FF}>FF</option>
                                <option value={DependencyType.SF}>SF</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Lag (days)
                              </label>
                              <input
                                type="number"
                                value={editingDependency.lag}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, lag: parseInt(e.target.value) || 0 }) : null)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                min="-365"
                                max="365"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleUpdateDependency}
                              disabled={isUpdating}
                              className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <Save className="h-3 w-3" />
                              {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors flex items-center gap-1"
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Display mode
                        <div>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-gray-900">
                                {dependency.successor.wbsCode && (
                                  <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-2 text-xs">
                                    {dependency.successor.wbsCode}
                                  </span>
                                )}
                                {dependency.successor.title}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => startEditing(dependency)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Edit dependency"
                              >
                                <Edit2 className="h-3 w-3 text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteDependency(dependency.id)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Delete dependency"
                                disabled={isDeleting}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded font-medium ${getDependencyTypeColor(dependency.type)}`}>
                              {dependency.type}
                            </span>
                            {dependency.lag !== 0 && (
                              <span className="flex items-center gap-1 text-gray-600">
                                <Clock className="h-3 w-3" />
                                {dependency.lag > 0 ? `+${dependency.lag}` : dependency.lag} days
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )) || []}

                  {(!taskDependencies?.asPredecessor || taskDependencies.asPredecessor.length === 0) && !isAddingSuccessor && (
                    <p className="text-sm text-gray-500 text-center py-2">No successors</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 