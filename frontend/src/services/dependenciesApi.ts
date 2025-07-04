import api from './api';

export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag: number;
  createdAt: string;
  updatedAt: string;
  predecessor: {
    id: string;
    title: string;
    wbsCode: string;
  };
  successor: {
    id: string;
    title: string;
    wbsCode: string;
  };
}

export enum DependencyType {
  FS = 'FS', // Finish-to-Start
  SS = 'SS', // Start-to-Start
  FF = 'FF', // Finish-to-Finish
  SF = 'SF'  // Start-to-Finish
}

export interface CreateDependencyRequest {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag?: number;
}

export interface UpdateDependencyRequest {
  type?: DependencyType;
  lag?: number;
}

export interface TaskDependencies {
  asPredecessor: TaskDependency[];
  asSuccessor: TaskDependency[];
}

class DependenciesApiService {
  // Get all dependencies for a project
  async getAllDependencies(projectId?: string): Promise<TaskDependency[]> {
    const params = projectId ? { projectId } : {};
    const response = await api.get('/dependencies', { params });
    return response.data;
  }

  // Get dependencies for a specific task
  async getTaskDependencies(taskId: string): Promise<TaskDependencies> {
    const response = await api.get(`/dependencies/task/${taskId}`);
    return response.data;
  }

  // Get a specific dependency by ID
  async getDependency(dependencyId: string): Promise<TaskDependency> {
    const response = await api.get(`/dependencies/${dependencyId}`);
    return response.data;
  }

  // Create a new dependency
  async createDependency(dependency: CreateDependencyRequest): Promise<TaskDependency> {
    const response = await api.post('/dependencies', dependency);
    return response.data;
  }

  // Update an existing dependency
  async updateDependency(
    dependencyId: string, 
    updates: UpdateDependencyRequest
  ): Promise<TaskDependency> {
    const response = await api.patch(`/dependencies/${dependencyId}`, updates);
    return response.data;
  }

  // Delete a dependency
  async deleteDependency(dependencyId: string): Promise<void> {
    await api.delete(`/dependencies/${dependencyId}`);
  }
}

export const dependenciesApi = new DependenciesApiService(); 