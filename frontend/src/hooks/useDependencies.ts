import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  dependenciesApi, 
  TaskDependency, 
  CreateDependencyRequest, 
  UpdateDependencyRequest, 
  TaskDependencies 
} from '../services/dependenciesApi';

export const useDependencies = (projectId?: string) => {
  const queryClient = useQueryClient();

  // Get all dependencies for a project
  const { 
    data: allDependencies, 
    isLoading: isLoadingAll, 
    error: allError 
  } = useQuery({
    queryKey: ['dependencies', projectId],
    queryFn: () => dependenciesApi.getAllDependencies(projectId),
    enabled: !!projectId,
  });

  // Create dependency mutation
  const createDependencyMutation = useMutation({
    mutationFn: (dependency: CreateDependencyRequest) => 
      dependenciesApi.createDependency(dependency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency created successfully');
    },
    onError: (error: any) => {
      console.error('Error creating dependency:', error);
      const message = error.response?.data?.message || 'Failed to create dependency';
      toast.error(message);
    },
  });

  // Update dependency mutation
  const updateDependencyMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateDependencyRequest }) =>
      dependenciesApi.updateDependency(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating dependency:', error);
      const message = error.response?.data?.message || 'Failed to update dependency';
      toast.error(message);
    },
  });

  // Delete dependency mutation
  const deleteDependencyMutation = useMutation({
    mutationFn: (dependencyId: string) => 
      dependenciesApi.deleteDependency(dependencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] });
      toast.success('Dependency deleted successfully');
    },
    onError: (error: any) => {
      console.error('Error deleting dependency:', error);
      const message = error.response?.data?.message || 'Failed to delete dependency';
      toast.error(message);
    },
  });

  return {
    // Data
    allDependencies,
    
    // Loading states
    isLoadingAll,
    isCreating: createDependencyMutation.isPending,
    isUpdating: updateDependencyMutation.isPending,
    isDeleting: deleteDependencyMutation.isPending,
    
    // Error states
    allError,
    
    // Actions
    createDependency: (dependency: CreateDependencyRequest) => 
      createDependencyMutation.mutate(dependency),
    updateDependency: (id: string, updates: UpdateDependencyRequest) => 
      updateDependencyMutation.mutate({ id, updates }),
    deleteDependency: (id: string) => 
      deleteDependencyMutation.mutate(id),
  };
};

// Hook for getting dependencies of a specific task
export const useTaskDependencies = (taskId: string | null) => {
  const queryClient = useQueryClient();

  const { 
    data: taskDependencies, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['task-dependencies', taskId],
    queryFn: () => dependenciesApi.getTaskDependencies(taskId!),
    enabled: !!taskId,
  });

  return {
    taskDependencies,
    isLoading,
    error,
    // Helper function to refetch when needed
    refetch: () => queryClient.invalidateQueries({ queryKey: ['task-dependencies', taskId] }),
  };
}; 