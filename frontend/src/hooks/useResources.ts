import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  resourcesApi,
  ResourceType,
  Resource,
  TaskResources,
  CreateResourceTypeRequest,
  CreateResourceRequest,
  UpdateResourceRequest,
  CreateMultiAssignmentRequest,
  UpdateAssignmentRequest,
} from '../services/resourcesApi';

// Resource Types
export const useResourceTypes = () => {
  return useQuery({
    queryKey: ['resource-types'],
    queryFn: resourcesApi.getResourceTypes,
  });
};

export const useCreateResourceType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceTypeRequest) => resourcesApi.createResourceType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-types'] });
      toast.success('Resource type created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create resource type');
    },
  });
};

export const useDeleteResourceType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteResourceType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-types'] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      toast.success('Resource type deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete resource type');
    },
  });
};

// Resources
export const useResources = (typeId?: string) => {
  return useQuery({
    queryKey: ['resources', typeId],
    queryFn: () => resourcesApi.getResources(typeId),
  });
};

export const useCreateResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceRequest) => resourcesApi.createResource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-types'] });
      toast.success('Resource created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create resource');
    },
  });
};

export const useUpdateResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateResourceRequest }) =>
      resourcesApi.updateResource(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-types'] });
      toast.success('Resource updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update resource');
    },
  });
};

export const useDeleteResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteResource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-types'] });
      queryClient.invalidateQueries({ queryKey: ['task-resources'] });
      toast.success('Resource deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete resource');
    },
  });
};

// Task Resource Assignments
export const useTaskResources = (taskId: string | null) => {
  return useQuery({
    queryKey: ['task-resources', taskId],
    queryFn: () => resourcesApi.getTaskResources(taskId!),
    enabled: !!taskId,
    retry: false,
  });
};

export const useAvailableResources = (taskId: string | null, typeId?: string) => {
  return useQuery({
    queryKey: ['available-resources', taskId, typeId],
    queryFn: () => resourcesApi.getAvailableResources(taskId!, typeId),
    enabled: !!taskId,
    retry: false,
  });
};

export const useCreateTaskAssignments = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateMultiAssignmentRequest }) =>
      resourcesApi.createTaskAssignments(taskId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-resources', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['available-resources', variables.taskId] });
      toast.success('Resources assigned successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to assign resources');
    },
  });
};

export const useUpdateAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssignmentRequest }) =>
      resourcesApi.updateAssignment(id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['task-resources', result.taskId] });
      toast.success('Assignment updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update assignment');
    },
  });
};

export const useDeleteAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-resources'] });
      queryClient.invalidateQueries({ queryKey: ['available-resources'] });
      toast.success('Assignment deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete assignment');
    },
  });
}; 