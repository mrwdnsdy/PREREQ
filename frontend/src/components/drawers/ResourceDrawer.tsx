import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Edit2, 
  Trash2, 
  Users,
  Save,
  Check,
  Clock,
  ArrowRight,
  DollarSign,
  FileText
} from 'lucide-react';
import { Listbox, Tab } from '@headlessui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Task } from '../../hooks/useTasks';
import {
  useTaskResources,
  useAvailableResources,
  useCreateTaskAssignments,
  useUpdateAssignment,
  useDeleteAssignment,
} from '../../hooks/useResources';
import { useTaskDependencies } from '../../hooks/useDependencies';
import {
  Resource,
  CreateAssignmentRequest,
  resourcesApi,
  ResourceType
} from '../../services/resourcesApi';
import { 
  DependencyType, 
  CreateDependencyRequest, 
  UpdateDependencyRequest,
  TaskDependency,
  dependenciesApi
} from '../../services/dependenciesApi';
import api from '../../services/api';

interface ResourceDrawerProps {
  selectedTask: Task | null;
  allTasks: Task[];
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}

interface NewResourceForm {
  selectedTypeId: string;
  selectedResources: Resource[];
  hours: number;
}

export const ResourceDrawer: React.FC<ResourceDrawerProps> = ({
  selectedTask,
  allTasks,
  projectId,
  isOpen,
  onClose,
  onToggleCollapse,
  isCollapsed
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingHours, setEditingHours] = useState<number>(0);

  // Dependencies state
  const [isAddingPredecessor, setIsAddingPredecessor] = useState(false);
  const [isAddingSuccessor, setIsAddingSuccessor] = useState(false);
  const [editingDependency, setEditingDependency] = useState<{
    id: string;
    type: DependencyType;
    lag: number;
  } | null>(null);
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

  // Notes state
  const [taskNotes, setTaskNotes] = useState<string>('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const [newResourceForm, setNewResourceForm] = useState<NewResourceForm>({
    selectedTypeId: '',
    selectedResources: [],
    hours: 8,
  });

  // Resource hooks - only load when Resources tab is active AND drawer is expanded
  const shouldLoadResources = activeTab === 0 && !isCollapsed && selectedTask?.id;
  const { data: taskResources, isLoading: isLoadingResources, error: resourcesError } = useTaskResources(
    shouldLoadResources ? selectedTask.id : null
  );
  
  // Only load resource types when we need them for the resources tab
  const { data: resourceTypes } = useQuery<ResourceType[]>({
    queryKey: ['resource-types'],
    queryFn: resourcesApi.getResourceTypes,
    enabled: !!(shouldLoadResources || isAddingResource)
  });
  
  // Decide when to load available resources
  const shouldLoadAvailable = shouldLoadResources && newResourceForm.selectedTypeId !== '';

  const { data: availableResources } = useAvailableResources(
    shouldLoadAvailable ? selectedTask.id : null,
    shouldLoadAvailable ? newResourceForm.selectedTypeId : undefined
  );

  const { mutate: createAssignments, isPending: isCreating } = useCreateTaskAssignments();
  const { mutate: updateAssignment, isPending: isUpdating } = useUpdateAssignment();
  const { mutate: deleteAssignment, isPending: isDeleting } = useDeleteAssignment();

  // Dependencies hooks - only load when Dependencies tab is active AND drawer is expanded
  const shouldLoadDependencies = activeTab === 1 && !isCollapsed && selectedTask?.id;
  
  // Create a lightweight version of useDependencies that doesn't load all project dependencies
  const queryClient = useQueryClient();
  const createDependencyMutation = useMutation({
    mutationFn: (dependency: CreateDependencyRequest) => 
      dependenciesApi.createDependency(dependency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency created successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create dependency';
      toast.error(message);
    },
  });

  const updateDependencyMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateDependencyRequest }) =>
      dependenciesApi.updateDependency(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update dependency';
      toast.error(message);
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: (dependencyId: string) => 
      dependenciesApi.deleteDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency deleted successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete dependency';
      toast.error(message);
    },
  });

  const createDependency = createDependencyMutation.mutate;
  const updateDependency = (id: string, updates: UpdateDependencyRequest) => 
    updateDependencyMutation.mutate({ id, updates });
  const deleteDependency = deleteDependencyMutation.mutate;
  const isCreatingDependency = createDependencyMutation.isPending;
  const isUpdatingDependency = updateDependencyMutation.isPending;
  const isDeletingDependency = deleteDependencyMutation.isPending;

  const { 
    taskDependencies, 
    isLoading: isLoadingDependencies 
  } = useTaskDependencies(shouldLoadDependencies ? selectedTask.id : null);

  // Tasks hook for updating task notes - only use the mutation, not the query
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) =>
      api.patch(`/tasks/${taskId}`, updates).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      toast.success('Task updated successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update task';
      toast.error(message);
    },
  });
  const updateTask = (taskId: string, updates: Partial<Task>) => 
    updateTaskMutation.mutate({ taskId, updates });
  const isUpdatingTask = updateTaskMutation.isPending;

  // Reset form when task changes
  useEffect(() => {
    setNewResourceForm({
      selectedTypeId: '',
      selectedResources: [],
      hours: 8,
    });
    setIsAddingResource(false);
    setEditingAssignmentId(null);
    setIsAddingPredecessor(false);
    setIsAddingSuccessor(false);
    setEditingDependency(null);
  }, [selectedTask?.id]);

  // Reset resource selection when type changes
  useEffect(() => {
    setNewResourceForm(prev => ({
      ...prev,
      selectedResources: [],
    }));
  }, [newResourceForm.selectedTypeId]);

  const tabs = ['Resources', 'Dependencies', 'Budget', 'Status', 'Notes'];

  // Available tasks for dependencies (excluding the selected task and headers)
  const availableTasks = allTasks.filter(task => 
    task.id !== selectedTask?.id && !task.isHeader
  );

  // Dependencies helper functions
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

  const startEditingDependency = (dependency: TaskDependency) => {
    setEditingDependency({
      id: dependency.id,
      type: dependency.type,
      lag: dependency.lag
    });
  };

  const cancelEditingDependency = () => {
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

  // Helper to resolve a task's label (WBS or activityId + title) using embedded object or allTasks list
  const getTaskLabel = (embeddedTask: any, taskId: string) => {
    if (embeddedTask) {
      const code = embeddedTask.wbsCode || embeddedTask.activityId || '';
      const title = embeddedTask.title || embeddedTask.name || '';
      return `${code ? code + ' - ' : ''}${title}`;
    }
    const fallback = allTasks.find(t => t.id === taskId);
    if (fallback) {
      const code = fallback.wbsCode || fallback.activityId || '';
      return `${code ? code + ' - ' : ''}${fallback.title || fallback.name}`;
    }
    return 'Unknown Task';
  };

  // Format date to match the table columns format (DD-MMM-YYYY)
  const formatDate = (dateInput: string | Date | null): string => {
    if (!dateInput) return '-';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '-';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
  };

  // Helper to get a task's start and end dates.
  // Sometimes the dependency object only contains a partial task (id, code, title) but not the dates.
  // In that case, fall back to the fully-loaded task that we have in the `allTasks` array.
  const getTaskDates = (embeddedTask: any, taskId: string) => {
    let t = embeddedTask;

    // If the embedded task is missing date fields, try to look it up in the full task list.
    if (!t?.startDate || !t?.endDate) {
      t = allTasks.find(fullTask => fullTask.id === taskId);
    }

    if (t) {
      return { start: t.startDate, end: t.endDate };
    }

    return { start: null, end: null };
  };

  // Utility to add days
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Auto-adjust dates when dependencies change
  useEffect(() => {
    if (!selectedTask || !taskDependencies) return;

    const predecessors = taskDependencies.asSuccessor.filter(dep => dep.successorId === selectedTask.id);
    if (predecessors.length === 0) return;

    let minStart = selectedTask.startDate;
    predecessors.forEach(dep => {
      const { start, end } = getTaskDates(dep.predecessor, dep.predecessorId);
      if (!start || !end) return;
      switch (dep.type) {
        case DependencyType.FS:
          // successor cannot start before predecessor finish + lag
          const fsDate = addDays(end, dep.lag || 0);
          if (!minStart || fsDate > minStart) minStart = fsDate;
          break;
        case DependencyType.SS:
          const ssDate = addDays(start, dep.lag || 0);
          if (!minStart || ssDate > minStart) minStart = ssDate;
          break;
        default:
          break;
      }
    });

    if (minStart && minStart !== selectedTask.startDate) {
      // assume duration stays same
      const durationDays = selectedTask.duration || 0;
      const end = addDays(minStart, durationDays);
      updateTask(selectedTask.id, { startDate: minStart, endDate: end });
    }
  }, [taskDependencies, selectedTask?.id]);

  const handleAddResource = () => {
    if (!selectedTask || newResourceForm.selectedResources.length === 0 || newResourceForm.hours <= 0) {
      return;
    }

    const assignments: CreateAssignmentRequest[] = newResourceForm.selectedResources.map(resource => ({
      resourceId: resource.id,
      hours: newResourceForm.hours,
    }));

    createAssignments(
      { taskId: selectedTask.id, data: { assignments } },
      {
        onSuccess: () => {
          setIsAddingResource(false);
          setNewResourceForm({
            selectedTypeId: '',
            selectedResources: [],
            hours: 8,
          });
        },
      }
    );
  };

  const handleEditHours = (assignmentId: string, currentHours: number) => {
    setEditingAssignmentId(assignmentId);
    setEditingHours(currentHours);
  };

  const handleSaveHours = () => {
    if (editingAssignmentId && editingHours > 0) {
      updateAssignment(
        { id: editingAssignmentId, data: { hours: editingHours } },
        {
          onSuccess: () => {
            setEditingAssignmentId(null);
            setEditingHours(0);
          },
        }
      );
    }
  };

  const handleCancelEdit = () => {
    setEditingAssignmentId(null);
    setEditingHours(0);
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    if (window.confirm('Are you sure you want to remove this resource assignment?')) {
      deleteAssignment(assignmentId);
    }
  };

  const filteredAvailableResources = availableResources?.filter(
    resource => !newResourceForm.selectedResources.some(selected => selected.id === resource.id)
  ) || [];

  // Calculate positioning based on both panels' states
  const getPositioning = () => {
    if (!isOpen) {
      return 'right-0 translate-x-full'; // Hide completely when closed
    }
    // Always show at right edge when open (whether collapsed or expanded)
    return 'right-0';
  };

  // Budget calculation functions
  const calculateResourceCosts = () => {
    if (!taskResources?.assignments) return { totalCost: 0, breakdown: [] };

    const breakdown = taskResources.assignments.map(assignment => {
      const cost = assignment.hours * assignment.resource.rateFloat;
      return {
        resourceName: assignment.resource.name,
        resourceType: assignment.resource.type.name,
        hours: assignment.hours,
        rate: assignment.resource.rateFloat,
        cost: cost
      };
    });

    const totalCost = breakdown.reduce((sum, item) => sum + item.cost, 0);

    return { totalCost, breakdown };
  };

  const getBudgetSummary = () => {
    const budgetSummary = calculateResourceCosts();
    
    // Group by resource type
    const byType = budgetSummary.breakdown.reduce((acc, item) => {
      if (!acc[item.resourceType]) {
        acc[item.resourceType] = { cost: 0, hours: 0, count: 0 };
      }
      acc[item.resourceType].cost += item.cost;
      acc[item.resourceType].hours += item.hours;
      acc[item.resourceType].count += 1;
      return acc;
    }, {} as Record<string, { cost: number; hours: number; count: number }>);

    return { totalCost: budgetSummary.totalCost, breakdown: budgetSummary.breakdown, byType };
  };

  // Notes handlers
  const handleEditNotes = () => {
    setTaskNotes(selectedTask?.description || '');
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    if (!selectedTask || !updateTask) return;
    
    updateTask(selectedTask.id, { description: taskNotes });
    setIsEditingNotes(false);
  };

  const handleCancelNotes = () => {
    setTaskNotes(selectedTask?.description || '');
    setIsEditingNotes(false);
  };

  const predecessors = taskDependencies ? taskDependencies.asSuccessor.filter(dep => dep.successorId === selectedTask?.id) : [];
  const successors = taskDependencies ? taskDependencies.asPredecessor.filter(dep => dep.predecessorId === selectedTask?.id) : [];

  return (
    <div className={`fixed top-0 h-screen transition-all duration-300 z-50 ${
      isCollapsed 
        ? 'w-12 bg-white border-l border-gray-200 shadow-md' 
        : 'w-80 bg-white border-l border-gray-200 shadow-lg'
    } ${getPositioning()}`}>
      {/* Header with chevron */}
      <div className={`flex items-center justify-between border-b ${
        isCollapsed ? 'border-gray-200 p-0' : 'border-gray-200 p-4'
      }`}>
        {!isCollapsed && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Task Details</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={onToggleCollapse}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Collapse panel"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
        {isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="w-full h-12 text-gray-600 hover:text-gray-800 hover:bg-gray-50 transition-all duration-200 flex items-center justify-center"
            title="Expand Resource Panel"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="flex flex-col h-full">
          {!selectedTask ? (
            <div className="flex-1 flex items-center justify-center text-center text-gray-500 py-8">
              <div>
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>Select a task to view its resources</p>
              </div>
            </div>
          ) : (
            <>
              {/* Selected Task Info */}
              <div className="bg-blue-50 p-3 border-b border-gray-200">
                <h4 className="font-medium text-blue-900 mb-1">
                  {selectedTask.activityId && (
                    <span className="font-mono bg-blue-100 px-2 py-1 rounded mr-2 text-xs">
                      {selectedTask.activityId}
                    </span>
                  )}
                  {selectedTask.title || selectedTask.name}
                </h4>
              </div>

              {/* Tabs */}
              <Tab.Group selectedIndex={activeTab} onChange={setActiveTab}>
                <Tab.List className="flex border-b border-gray-200 bg-gray-50">
                  {tabs.map((tab) => (
                    <Tab
                      key={tab}
                      className={({ selected }) =>
                        `flex-1 py-1.5 px-2 text-xs font-medium text-center border-b-2 transition-colors ${
                          selected
                            ? 'border-blue-500 text-blue-600 bg-white'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`
                      }
                    >
                      {tab === 'Dependencies' ? 'Deps' : tab}
                    </Tab>
                  ))}
                </Tab.List>

                <Tab.Panels className="flex-1 overflow-y-auto">
                  {/* Resources Tab */}
                  <Tab.Panel className="p-4 space-y-4">
                    {isLoadingResources ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-sm text-gray-500 mt-2">Loading resources...</p>
                      </div>
                    ) : resourcesError ? (
                      <div className="text-center py-4 text-sm text-gray-500">
                        No resources assigned.
                      </div>
                    ) : (
                      <>
                        {/* Add Resource Form */}
                        {isAddingResource && (
                          <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
                            <h5 className="font-medium text-gray-900">Add Resource</h5>
                            
                            {/* Resource Type Dropdown */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Resource Type
                              </label>
                              <Listbox
                                value={newResourceForm.selectedTypeId}
                                onChange={(value) => setNewResourceForm(prev => ({ ...prev, selectedTypeId: value }))}
                              >
                                <div className="relative">
                                  <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <span className="block truncate">
                                      {resourceTypes?.find(type => type.id === newResourceForm.selectedTypeId)?.name || 'Select a type...'}
                                    </span>
                                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                      <ChevronRight className="h-4 w-4 text-gray-400 rotate-90" />
                                    </span>
                                  </Listbox.Button>
                                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                    {resourceTypes?.map((type) => (
                                      <Listbox.Option
                                        key={type.id}
                                        value={type.id}
                                        className={({ active }) =>
                                          `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                            active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                                          }`
                                        }
                                      >
                                        {({ selected }) => (
                                          <>
                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                              {type.name}
                                            </span>
                                            {selected && (
                                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                                <Check className="h-4 w-4" />
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </Listbox.Option>
                                    ))}
                                  </Listbox.Options>
                                </div>
                              </Listbox>
                            </div>

                            {/* Resources Multi-Select */}
                            {newResourceForm.selectedTypeId && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Resources
                                </label>
                                <Listbox
                                  value={newResourceForm.selectedResources}
                                  onChange={(value) => setNewResourceForm(prev => ({ ...prev, selectedResources: value }))}
                                  multiple
                                >
                                  <div className="relative">
                                    <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <span className="block truncate">
                                        {newResourceForm.selectedResources.length === 0
                                          ? 'Select resources...'
                                          : `${newResourceForm.selectedResources.length} resource(s) selected`
                                        }
                                      </span>
                                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                        <ChevronRight className="h-4 w-4 text-gray-400 rotate-90" />
                                      </span>
                                    </Listbox.Button>
                                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                      {filteredAvailableResources.length === 0 ? (
                                        <div className="py-2 px-4 text-sm text-gray-500">
                                          No available resources
                                        </div>
                                      ) : (
                                        filteredAvailableResources.map((resource) => (
                                          <Listbox.Option
                                            key={resource.id}
                                            value={resource}
                                            className={({ active }) =>
                                              `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                                active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                                              }`
                                            }
                                          >
                                            {({ selected }) => (
                                              <>
                                                <div className="flex justify-between">
                                                  <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                                    {resource.name}
                                                  </span>
                                                  <span className="text-sm text-gray-500">
                                                    ${resource.rateFloat}/hr
                                                  </span>
                                                </div>
                                                {selected && (
                                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                                    <Check className="h-4 w-4" />
                                                  </span>
                                                )}
                                              </>
                                            )}
                                          </Listbox.Option>
                                        ))
                                      )}
                                    </Listbox.Options>
                                  </div>
                                </Listbox>
                              </div>
                            )}

                            {/* Hours Input */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Hours
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="9999"
                                value={newResourceForm.hours}
                                onChange={(e) => setNewResourceForm(prev => ({ ...prev, hours: parseInt(e.target.value) || 1 }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={handleAddResource}
                                disabled={isCreating || newResourceForm.selectedResources.length === 0}
                                className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCreating ? 'Adding...' : 'Add Resources'}
                              </button>
                              <button
                                onClick={() => setIsAddingResource(false)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Resource Assignments Table */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium text-gray-900">Assigned Resources</h5>
                            {!isAddingResource && (
                              <button
                                onClick={() => setIsAddingResource(true)}
                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                              >
                                <Plus className="h-4 w-4" />
                                Add Resource
                              </button>
                            )}
                          </div>

                          {taskResources?.assignments.length === 0 ? (
                            <div className="text-center py-6 text-gray-500">
                              <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No resources assigned</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200">
                                <span>Name</span>
                                <span>Hours</span>
                                <span>Rate</span>
                                <span className="text-right">Actions</span>
                              </div>
                              {taskResources?.assignments.map((assignment) => (
                                <div key={assignment.id} className="grid grid-cols-4 gap-2 items-center py-2 border-b border-gray-100">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {assignment.resource.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {assignment.resource.type.name}
                                    </p>
                                  </div>
                                  <div>
                                    {editingAssignmentId === assignment.id ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min="1"
                                          max="9999"
                                          value={editingHours}
                                          onChange={(e) => setEditingHours(parseInt(e.target.value) || 1)}
                                          className="w-16 px-1 py-1 text-xs border border-gray-300 rounded"
                                          autoFocus
                                        />
                                        <button
                                          onClick={handleSaveHours}
                                          disabled={isUpdating}
                                          className="p-1 text-green-600 hover:text-green-700"
                                        >
                                          <Save className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={handleCancelEdit}
                                          className="p-1 text-gray-600 hover:text-gray-700"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span 
                                        className="text-sm cursor-pointer hover:bg-gray-100 px-1 rounded"
                                        onDoubleClick={() => handleEditHours(assignment.id, assignment.hours)}
                                      >
                                        {assignment.hours}h
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    ${assignment.resource.rateFloat}
                                  </div>
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={() => handleEditHours(assignment.id, assignment.hours)}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Edit hours"
                                    >
                                      <Edit2 className="h-3 w-3 text-gray-500" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteAssignment(assignment.id)}
                                      disabled={isDeleting}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Remove assignment"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Tab.Panel>

                  {/* Dependencies Tab */}
                  <Tab.Panel className="p-4">
                    {isLoadingDependencies ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-sm text-gray-500 mt-2">Loading dependencies...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Current Task Dates */}
                        {selectedTask && (
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <h6 className="font-medium text-blue-900 mb-2">Current Task Schedule</h6>
                            <div className="text-sm text-blue-800">
                              <span className="font-medium">{formatDate(selectedTask.startDate)} → {formatDate(selectedTask.endDate)}</span>
                              <span className="text-blue-600 ml-2">({selectedTask.duration || 0} days)</span>
                            </div>
                          </div>
                        )}

                        {/* Predecessors Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium text-gray-900">Predecessors</h5>
                            {!isAddingPredecessor && (
                              <button
                                onClick={() => {
                                  setIsAddingPredecessor(true);
                                  setNewDependency(prev => ({ ...prev, isPredecessor: true }));
                                }}
                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                              >
                                <Plus className="h-4 w-4" />
                                Add
                              </button>
                            )}
                          </div>

                          {/* Add Predecessor Form */}
                          {isAddingPredecessor && (
                            <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
                              <h6 className="font-medium text-gray-900">Add Predecessor</h6>
                              
                              {/* Task Selection */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Task
                                </label>
                                <select
                                  value={newDependency.taskId}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, taskId: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Select a task...</option>
                                  {availableTasks.map((task) => (
                                    <option key={task.id} value={task.id}>
                                      {task.activityId ? `${task.activityId} - ` : ''}{task.title || task.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Dependency Type */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Type
                                </label>
                                <select
                                  value={newDependency.type}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, type: e.target.value as DependencyType }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value={DependencyType.FS}>Finish-to-Start (FS)</option>
                                  <option value={DependencyType.SS}>Start-to-Start (SS)</option>
                                  <option value={DependencyType.FF}>Finish-to-Finish (FF)</option>
                                  <option value={DependencyType.SF}>Start-to-Finish (SF)</option>
                                </select>
                              </div>

                              {/* Lag */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Lag (days)
                                </label>
                                <input
                                  type="number"
                                  value={newDependency.lag}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, lag: parseInt(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateDependency}
                                  disabled={isCreatingDependency || !newDependency.taskId}
                                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isCreatingDependency ? 'Adding...' : 'Add Predecessor'}
                                </button>
                                <button
                                  onClick={() => setIsAddingPredecessor(false)}
                                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Predecessors List */}
                          {predecessors.length === 0 ? (
                            <div className="text-center py-4 text-gray-500">
                              <Clock className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No predecessors</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {predecessors.map((dep) => (
                                <div key={dep.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-900">
                                        {getTaskLabel(dep.predecessor, dep.predecessorId)}
                                      </span>
                                      <ArrowRight className="h-3 w-3 text-gray-400" />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${getDependencyTypeColor(dep.type)}`}>
                                        {dep.type}
                                      </span>
                                      {dep.lag !== 0 && (
                                        <span className="text-xs text-gray-500">
                                          {dep.lag > 0 ? '+' : ''}{dep.lag} days
                                        </span>
                                      )}
                                    </div>
                                    <div className="ml-2 text-xs text-gray-500">
                                      {(() => {
                                        const dates = getTaskDates(dep.predecessor, dep.predecessorId);
                                        return `${formatDate(dates.start)} → ${formatDate(dates.end)}`;
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => startEditingDependency(dep)}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Edit dependency"
                                    >
                                      <Edit2 className="h-3 w-3 text-gray-500" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteDependency(dep.id)}
                                      disabled={isDeletingDependency}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Delete dependency"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Successors Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium text-gray-900">Successors</h5>
                            {!isAddingSuccessor && (
                              <button
                                onClick={() => {
                                  setIsAddingSuccessor(true);
                                  setNewDependency(prev => ({ ...prev, isPredecessor: false }));
                                }}
                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                              >
                                <Plus className="h-4 w-4" />
                                Add
                              </button>
                            )}
                          </div>

                          {/* Add Successor Form */}
                          {isAddingSuccessor && (
                            <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
                              <h6 className="font-medium text-gray-900">Add Successor</h6>
                              
                              {/* Task Selection */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Task
                                </label>
                                <select
                                  value={newDependency.taskId}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, taskId: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Select a task...</option>
                                  {availableTasks.map((task) => (
                                    <option key={task.id} value={task.id}>
                                      {task.activityId ? `${task.activityId} - ` : ''}{task.title || task.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Dependency Type */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Type
                                </label>
                                <select
                                  value={newDependency.type}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, type: e.target.value as DependencyType }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value={DependencyType.FS}>Finish-to-Start (FS)</option>
                                  <option value={DependencyType.SS}>Start-to-Start (SS)</option>
                                  <option value={DependencyType.FF}>Finish-to-Finish (FF)</option>
                                  <option value={DependencyType.SF}>Start-to-Finish (SF)</option>
                                </select>
                              </div>

                              {/* Lag */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Lag (days)
                                </label>
                                <input
                                  type="number"
                                  value={newDependency.lag}
                                  onChange={(e) => setNewDependency(prev => ({ ...prev, lag: parseInt(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateDependency}
                                  disabled={isCreatingDependency || !newDependency.taskId}
                                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isCreatingDependency ? 'Adding...' : 'Add Successor'}
                                </button>
                                <button
                                  onClick={() => setIsAddingSuccessor(false)}
                                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Successors List */}
                          {successors.length === 0 ? (
                            <div className="text-center py-4 text-gray-500">
                              <Clock className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No successors</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {successors.map((dep) => (
                                <div key={dep.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <ArrowRight className="h-3 w-3 text-gray-400" />
                                      <span className="text-sm font-medium text-gray-900">
                                        {getTaskLabel(dep.successor, dep.successorId)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${getDependencyTypeColor(dep.type)}`}>
                                        {dep.type}
                                      </span>
                                      {dep.lag !== 0 && (
                                        <span className="text-xs text-gray-500">
                                          {dep.lag > 0 ? '+' : ''}{dep.lag} days
                                        </span>
                                      )}
                                    </div>
                                    <div className="ml-2 text-xs text-gray-500">
                                      {(() => {
                                        const dates = getTaskDates(dep.successor, dep.successorId);
                                        return `${formatDate(dates.start)} → ${formatDate(dates.end)}`;
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => startEditingDependency(dep)}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Edit dependency"
                                    >
                                      <Edit2 className="h-3 w-3 text-gray-500" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteDependency(dep.id)}
                                      disabled={isDeletingDependency}
                                      className="p-1 hover:bg-gray-100 rounded"
                                      title="Delete dependency"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Edit Dependency Modal/Form */}
                        {editingDependency && (
                          <div className="bg-blue-50 p-4 rounded-lg border space-y-3">
                            <h6 className="font-medium text-blue-900">Edit Dependency</h6>
                            
                            {/* Dependency Type */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Type
                              </label>
                              <select
                                value={editingDependency.type}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, type: e.target.value as DependencyType }) : null)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value={DependencyType.FS}>Finish-to-Start (FS)</option>
                                <option value={DependencyType.SS}>Start-to-Start (SS)</option>
                                <option value={DependencyType.FF}>Finish-to-Finish (FF)</option>
                                <option value={DependencyType.SF}>Start-to-Finish (SF)</option>
                              </select>
                            </div>

                            {/* Lag */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Lag (days)
                              </label>
                              <input
                                type="number"
                                value={editingDependency.lag}
                                onChange={(e) => setEditingDependency(prev => prev ? ({ ...prev, lag: parseInt(e.target.value) || 0 }) : null)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={handleUpdateDependency}
                                disabled={isUpdatingDependency}
                                className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isUpdatingDependency ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                onClick={cancelEditingDependency}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Tab.Panel>

                  {/* Budget Tab */}
                  <Tab.Panel className="p-4 space-y-4">
                    {(() => {
                      const budgetSummary = getBudgetSummary();
                      const plannedBudget = selectedTask?.budget || 0;
                      const hasResources = budgetSummary.breakdown.length > 0;
                      const displayBudget = hasResources ? budgetSummary.totalCost : plannedBudget;
                      return (
                        <div>
                          {/* Budget Summary */}
                          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border">
                            <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                              <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                              Total Budget
                            </h4>
                            <div className="text-2xl font-bold text-green-600">
                              ${displayBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {hasResources && plannedBudget > 0 && (
                              <div className="mt-1 text-sm text-gray-600">
                                Planned: ${plannedBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>

                          {/* Budget by Resource Type */}
                          {Object.keys(budgetSummary.byType).length > 0 && (
                            <div>
                              <h5 className="font-medium text-gray-900 mb-3">Cost by Resource Type</h5>
                              <div className="space-y-2">
                                {Object.entries(budgetSummary.byType).map(([type, data]) => (
                                  <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <div>
                                      <span className="font-medium text-gray-900">{type}</span>
                                      <span className="text-sm text-gray-500 ml-2">
                                        ({data.count} resource{data.count !== 1 ? 's' : ''}, {data.hours} hrs)
                                      </span>
                                    </div>
                                    <span className="font-semibold text-gray-900">
                                      ${data.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Detailed Breakdown */}
                          {budgetSummary.breakdown.length > 0 && (
                            <div>
                              <h5 className="font-medium text-gray-900 mb-3">Detailed Breakdown</h5>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200">
                                      <th className="text-left py-2 font-medium text-gray-700">Resource</th>
                                      <th className="text-right py-2 font-medium text-gray-700">Hours</th>
                                      <th className="text-right py-2 font-medium text-gray-700">Rate</th>
                                      <th className="text-right py-2 font-medium text-gray-700">Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {budgetSummary.breakdown.map((item, index) => (
                                      <tr key={index} className="border-b border-gray-100">
                                        <td className="py-2">
                                          <div>
                                            <div className="font-medium text-gray-900">{item.resourceName}</div>
                                            <div className="text-xs text-gray-500">{item.resourceType}</div>
                                          </div>
                                        </td>
                                        <td className="text-right py-2 text-gray-900">{item.hours}</td>
                                        <td className="text-right py-2 text-gray-600">${item.rate}/hr</td>
                                        <td className="text-right py-2 font-medium text-gray-900">
                                          ${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* No resources message */}
                          {!hasResources && (
                            <div className="text-center py-8 text-gray-500">
                              <DollarSign className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                              <p>No resources assigned</p>
                              <p className="text-sm">Planned budget: ${plannedBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </Tab.Panel>

                  {/* Status Tab */}
                  <Tab.Panel className="p-4">
                    <div className="text-center text-gray-500 py-8">
                      <p>Status tracking will be implemented later</p>
                    </div>
                  </Tab.Panel>

                  {/* Notes Tab */}
                  <Tab.Panel className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-gray-900 flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Task Notes
                      </h4>
                      {!isEditingNotes && (
                        <button
                          onClick={handleEditNotes}
                          className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </button>
                      )}
                    </div>

                    {isEditingNotes ? (
                      <div className="space-y-3">
                        <textarea
                          value={taskNotes}
                          onChange={(e) => setTaskNotes(e.target.value)}
                          placeholder="Add notes for this task..."
                          className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveNotes}
                            disabled={isUpdatingTask}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUpdatingTask ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Saving...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                Save Notes
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleCancelNotes}
                            disabled={isUpdatingTask}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="min-h-[120px] p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        {selectedTask?.description ? (
                          <div className="whitespace-pre-wrap text-gray-900">
                            {selectedTask.description}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-8">
                            <FileText className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No notes added yet</p>
                            <button
                              onClick={handleEditNotes}
                              className="text-blue-600 hover:text-blue-700 text-sm mt-1"
                            >
                              Click to add notes
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Tab.Panel>
                </Tab.Panels>
              </Tab.Group>
            </>
          )}
        </div>
      )}
    </div>
  );
}; 