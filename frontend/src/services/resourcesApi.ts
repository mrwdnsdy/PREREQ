import api from './api';

// Types
export interface ResourceType {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  resources?: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  rateFloat: number;
  typeId: string;
  createdAt: string;
  updatedAt: string;
  type: ResourceType;
  assignments?: ResourceAssignment[];
}

export interface ResourceAssignment {
  id: string;
  taskId: string;
  resourceId: string;
  hours: number;
  createdAt: string;
  updatedAt: string;
  resource: Resource;
  task: {
    id: string;
    title: string;
    activityId: string;
    wbsCode: string;
  };
}

export interface TaskResources {
  task: {
    id: string;
    title: string;
    activityId: string;
    wbsCode: string;
  };
  assignments: ResourceAssignment[];
}

export interface CreateResourceTypeRequest {
  name: string;
}

export interface CreateResourceRequest {
  name: string;
  rateFloat: number;
  typeId: string;
}

export interface UpdateResourceRequest {
  name?: string;
  rateFloat?: number;
  typeId?: string;
}

export interface CreateAssignmentRequest {
  resourceId: string;
  hours: number;
}

export interface CreateMultiAssignmentRequest {
  assignments: CreateAssignmentRequest[];
}

export interface UpdateAssignmentRequest {
  hours: number;
}

class ResourcesApi {
  // Resource Types
  async getResourceTypes(): Promise<ResourceType[]> {
    const response = await api.get('/resources/types');
    return response.data;
  }

  async createResourceType(data: CreateResourceTypeRequest): Promise<ResourceType> {
    const response = await api.post('/resources/types', data);
    return response.data;
  }

  async deleteResourceType(id: string): Promise<void> {
    await api.delete(`/resources/types/${id}`);
  }

  // Resources
  async getResources(typeId?: string): Promise<Resource[]> {
    const params = typeId ? { typeId } : {};
    const response = await api.get('/resources', { params });
    return response.data;
  }

  async createResource(data: CreateResourceRequest): Promise<Resource> {
    const response = await api.post('/resources', data);
    return response.data;
  }

  async updateResource(id: string, data: UpdateResourceRequest): Promise<Resource> {
    const response = await api.patch(`/resources/${id}`, data);
    return response.data;
  }

  async deleteResource(id: string): Promise<void> {
    await api.delete(`/resources/${id}`);
  }

  // Task Resource Assignments
  async getTaskResources(taskId: string): Promise<TaskResources> {
    const response = await api.get(`/tasks/${taskId}/resources`);
    return response.data;
  }

  async createTaskAssignments(taskId: string, data: CreateMultiAssignmentRequest): Promise<ResourceAssignment[]> {
    const response = await api.post(`/tasks/${taskId}/resources`, data);
    return response.data;
  }

  async getAvailableResources(taskId: string, typeId?: string): Promise<Resource[]> {
    const params = typeId ? { typeId } : {};
    const response = await api.get(`/tasks/${taskId}/resources/available`, { params });
    return response.data;
  }

  // Assignment Management
  async updateAssignment(id: string, data: UpdateAssignmentRequest): Promise<ResourceAssignment> {
    const response = await api.patch(`/assignments/${id}`, data);
    return response.data;
  }

  async deleteAssignment(id: string): Promise<void> {
    await api.delete(`/assignments/${id}`);
  }
}

export const resourcesApi = new ResourcesApi();
export default resourcesApi; 