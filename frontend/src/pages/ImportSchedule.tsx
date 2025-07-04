import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { DatePickerCell } from '../components/DatePickerCell';

interface ImportTask {
  level: number;
  activityId: string;
  description: string;
  type?: string;
  duration?: number;
  startDate?: string;
  finishDate?: string;
  predecessors?: string;
  resourcing?: string;
  budget?: number;
  notes?: string;
}

interface ImportScheduleProps {
  onProjectCreated?: (project: any) => void;
  onBack?: () => void;
}

const ImportSchedule: React.FC<ImportScheduleProps> = ({ onProjectCreated, onBack }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ImportTask[]>([
    {
      level: 1,
      activityId: 'A1010',
      description: 'Project Initiation',
      type: 'Task',
      duration: 5,
      startDate: '2024-01-01',
      finishDate: '2024-01-05',
      budget: 5000
    }
  ]);
  const [importOptions, setImportOptions] = useState({
    replaceExisting: false,
    generateWbsCodes: true,
    validateDependencies: true
  });

  const handleAddTask = () => {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    setTasks([...tasks, {
      level: 1,
      activityId: '',
      description: '',
      type: 'Task',
      duration: 7,
      startDate: today,
      finishDate: nextWeek,
      budget: 0
    }]);
  };

  const handleUpdateTask = (index: number, field: keyof ImportTask, value: any) => {
    const updatedTasks = [...tasks];
    updatedTasks[index] = { ...updatedTasks[index], [field]: value };
    setTasks(updatedTasks);
  };

  const handleRemoveTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        if (file.name.endsWith('.csv')) {
          const parsedTasks = parseCsvData(text);
          setTasks(parsedTasks);
          toast.success(`Loaded ${parsedTasks.length} tasks from CSV`);
        } else if (file.name.endsWith('.json')) {
          const jsonData = JSON.parse(text);
          if (Array.isArray(jsonData)) {
            setTasks(jsonData);
            toast.success(`Loaded ${jsonData.length} tasks from JSON`);
          }
        }
      } catch (error) {
        toast.error('Failed to parse file');
        console.error('File parsing error:', error);
      }
    };
    reader.readAsText(file);
  };

  const parseCsvData = (csvText: string): ImportTask[] => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const parsedTasks: ImportTask[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const task: Partial<ImportTask> = {};
      
      headers.forEach((header, index) => {
        const value = values[index];
        switch (header.toLowerCase()) {
          case 'level':
            task.level = parseInt(value) || 1;
            break;
          case 'activity id':
          case 'activityid':
            task.activityId = value;
            break;
          case 'activity description':
          case 'description':
          case 'task name':
            task.description = value;
            break;
          case 'type':
            task.type = value;
            break;
          case 'duration':
            task.duration = parseFloat(value) || 0;
            break;
          case 'start date':
          case 'startdate':
            task.startDate = value;
            break;
          case 'finish date':
          case 'finishdate':
          case 'end date':
            task.finishDate = value;
            break;
          case 'predecessor':
          case 'predecessors':
            task.predecessors = value;
            break;
          case 'resourcing':
          case 'resource':
            task.resourcing = value;
            break;
          case 'budget':
          case 'cost':
            task.budget = parseFloat(value) || 0;
            break;
          case 'notes':
          case 'comments':
            task.notes = value;
            break;
        }
      });
      
      if (task.activityId && task.description) {
        parsedTasks.push(task as ImportTask);
      }
    }
    
    return parsedTasks;
  };

  const handleImport = async () => {
    if (!projectId) {
      toast.error('Project ID not found');
      return;
    }

    if (tasks.length === 0) {
      toast.error('No tasks to import');
      return;
    }

    // Validate and clean task data before sending
    const cleanedTasks = tasks.map(task => {
      // Convert YYYY-MM-DD dates to ISO format if they exist
      const convertDate = (dateStr: string | undefined) => {
        if (!dateStr || dateStr.trim() === '') return undefined;
        try {
          // If it's already in YYYY-MM-DD format, convert to full ISO
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return undefined;
          return date.toISOString().split('T')[0]; // Keep as YYYY-MM-DD for backend
        } catch {
          return undefined;
        }
      };

      return {
        ...task,
        // Clean and validate dates
        startDate: convertDate(task.startDate),
        finishDate: convertDate(task.finishDate),
        // Remove empty predecessors
        predecessors: task.predecessors && task.predecessors.trim() !== '' ? task.predecessors : undefined,
        // Remove empty resourcing
        resourcing: task.resourcing && task.resourcing.trim() !== '' ? task.resourcing : undefined,
        // Remove empty notes
        notes: task.notes && task.notes.trim() !== '' ? task.notes : undefined,
        // Ensure required fields are present
        type: task.type || 'Task',
        duration: task.duration || 0,
        budget: task.budget || 0
      };
    }).filter(task => 
      // Only include tasks with required fields
      task.activityId && task.activityId.trim() !== '' &&
      task.description && task.description.trim() !== ''
    );

    if (cleanedTasks.length === 0) {
      toast.error('No valid tasks to import. Please ensure Activity ID and Description are filled.');
      return;
    }

    setLoading(true);
    try {
      console.log('Starting import with data:', {
        projectId,
        tasks: cleanedTasks.slice(0, 2), // Log first 2 tasks for debugging
        options: importOptions
      });

      const response = await api.post(`/tasks/project/${projectId}/import-schedule`, {
        projectId,
        tasks: cleanedTasks,
        options: importOptions
      });

      toast.success(response.data.message);
      
      if (onProjectCreated) {
        onProjectCreated({ id: projectId });
      } else {
        navigate(`/projects/${projectId}`);
      }
    } catch (error: any) {
      console.error('Import error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      
      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please log in again.');
      } else if (error.response?.status === 403) {
        toast.error('You do not have permission to import to this project.');
      } else if (error.response?.status === 400) {
        toast.error(`Validation error: ${error.response?.data?.message || 'Invalid data format'}`);
      } else {
        toast.error(error.response?.data?.message || 'Failed to import schedule');
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = `Level,Activity ID,Activity Description,Type,Duration,Start Date,Finish Date,Predecessors,Resourcing,Budget,Notes
1,A1010,Project Planning Phase,Task,10,2024-01-01,2024-01-10,,Business Analyst: 80h,15000,Initial planning activities
2,A1020,Requirements Gathering,Task,5,2024-01-01,2024-01-05,,Business Analyst: 32h,8000,Gather and document requirements
3,A1030,Stakeholder Interviews,Task,3,2024-01-01,2024-01-03,,Business Analyst: 24h,3000,Interview key stakeholders
4,A1040,Interview Key Stakeholders,Task,2,2024-01-01,2024-01-02,,Business Analyst: 16h,2000,Conduct stakeholder interviews
4,A1050,Document Requirements,Task,1,2024-01-03,2024-01-03,A1040,Business Analyst: 8h,1000,Document gathered requirements
2,A1060,Technical Design,Task,5,2024-01-06,2024-01-10,A1020,Solutions Architect: 32h,7000,Create technical design
1,A2010,Development Phase,Task,20,2024-01-11,2024-01-30,A1010,,40000,Main development work
2,A2020,Frontend Development,Task,15,2024-01-11,2024-01-25,A1060,Developer: 120h,25000,Build user interface
2,A2030,Backend Development,Task,15,2024-01-11,2024-01-25,A1060,Developer: 120h,18000,Build backend APIs
2,A2040,Integration Testing,Task,5,2024-01-26,2024-01-30,"A2020,A2030",QA Engineer: 40h,4000,Test integrated system
1,A3010,Project Completion,Milestone,0,2024-01-30,2024-01-30,A2010,,0,Project completion milestone`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'schedule_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Template downloaded successfully');
  };

  const generateSampleData = () => {
    const sampleTasks: ImportTask[] = [
      {
        level: 1,
        activityId: 'A1010',
        description: 'Project Planning Phase',
        type: 'Task',
        duration: 10,
        startDate: '2024-01-01',
        finishDate: '2024-01-10',
        budget: 15000
      },
      {
        level: 2,
        activityId: 'A1020',
        description: 'Requirements Gathering',
        type: 'Task',
        duration: 5,
        startDate: '2024-01-01',
        finishDate: '2024-01-05',
        resourcing: 'Business Analyst: 32h, Developer: 8h',
        budget: 8000
      },
      {
        level: 3,
        activityId: 'A1030',
        description: 'Stakeholder Interviews',
        type: 'Task',
        duration: 3,
        startDate: '2024-01-01',
        finishDate: '2024-01-03',
        resourcing: 'Business Analyst: 24h',
        budget: 3000
      },
      {
        level: 4,
        activityId: 'A1040',
        description: 'Interview Key Stakeholders',
        type: 'Task',
        duration: 2,
        startDate: '2024-01-01',
        finishDate: '2024-01-02',
        resourcing: 'Business Analyst: 16h',
        budget: 2000
      },
      {
        level: 4,
        activityId: 'A1050',
        description: 'Document Requirements',
        type: 'Task',
        duration: 1,
        startDate: '2024-01-03',
        finishDate: '2024-01-03',
        predecessors: 'A1040',
        resourcing: 'Business Analyst: 8h',
        budget: 1000
      },
      {
        level: 2,
        activityId: 'A1060',
        description: 'Technical Design',
        type: 'Task',
        duration: 5,
        startDate: '2024-01-06',
        finishDate: '2024-01-10',
        predecessors: 'A1020',
        resourcing: 'Solutions Architect: 32h, Developer: 16h',
        budget: 7000
      },
      {
        level: 1,
        activityId: 'A2010',
        description: 'Development Phase',
        type: 'Task',
        duration: 20,
        startDate: '2024-01-11',
        finishDate: '2024-01-30',
        predecessors: 'A1010',
        budget: 40000
      },
      {
        level: 2,
        activityId: 'A2020',
        description: 'Frontend Development',
        type: 'Task',
        duration: 15,
        startDate: '2024-01-11',
        finishDate: '2024-01-25',
        predecessors: 'A1060',
        resourcing: 'Developer: 120h, Designer: 40h',
        budget: 25000
      },
      {
        level: 2,
        activityId: 'A2030',
        description: 'Backend Development',
        type: 'Task',
        duration: 15,
        startDate: '2024-01-11',
        finishDate: '2024-01-25',
        predecessors: 'A1060',
        resourcing: 'Developer: 120h',
        budget: 18000
      },
      {
        level: 2,
        activityId: 'A2040',
        description: 'Integration Testing',
        type: 'Task',
        duration: 5,
        startDate: '2024-01-26',
        finishDate: '2024-01-30',
        predecessors: 'A2020,A2030',
        resourcing: 'QA Engineer: 40h',
        budget: 4000
      },
      {
        level: 1,
        activityId: 'A3010',
        description: 'Project Completion',
        type: 'Milestone',
        duration: 0,
        startDate: '2024-01-30',
        finishDate: '2024-01-30',
        predecessors: 'A2010',
        budget: 0
      }
    ];
    
    setTasks(sampleTasks);
    toast.success('Sample data loaded');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Schedule</h1>
          <p className="text-gray-600">
            Convert traditional project management schedules to hierarchical WBS structure
          </p>
        </div>

        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Load Schedule Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload CSV/JSON File
              </label>
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={downloadTemplate}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Download Template
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={generateSampleData}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Load Sample Data
              </button>
            </div>
            <div className="flex items-end">
              <div className="text-xs text-gray-500">
                <p>Supported formats:</p>
                <p>• CSV (comma-separated)</p>
                <p>• JSON array format</p>
              </div>
            </div>
          </div>
        </div>

        {/* Import Options */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Import Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={importOptions.replaceExisting}
                onChange={(e) => setImportOptions({ ...importOptions, replaceExisting: e.target.checked })}
                className="mr-2"
              />
              Replace Existing Tasks
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={importOptions.generateWbsCodes}
                onChange={(e) => setImportOptions({ ...importOptions, generateWbsCodes: e.target.checked })}
                className="mr-2"
              />
              Generate WBS Codes
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={importOptions.validateDependencies}
                onChange={(e) => setImportOptions({ ...importOptions, validateDependencies: e.target.checked })}
                className="mr-2"
              />
              Validate Dependencies
            </label>
          </div>
        </div>

        {/* Task List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Tasks to Import ({tasks.length})</h2>
            <button
              onClick={handleAddTask}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Add Task
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity ID</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Finish Date</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Predecessors</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resourcing</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map((task, index) => (
                  <tr key={index} className={`${task.level <= 2 ? 'bg-blue-50' : task.level === 3 ? 'bg-green-50' : 'bg-white'}`}>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={task.level}
                        onChange={(e) => handleUpdateTask(index, 'level', parseInt(e.target.value))}
                        className="w-16 px-2 py-1 text-sm border rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={task.activityId}
                        onChange={(e) => handleUpdateTask(index, 'activityId', e.target.value)}
                        className="w-20 px-2 py-1 text-sm border rounded"
                        placeholder="A1010"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={task.description}
                        onChange={(e) => handleUpdateTask(index, 'description', e.target.value)}
                        className="w-48 px-2 py-1 text-sm border rounded"
                        placeholder="Task description"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={task.type || 'Task'}
                        onChange={(e) => handleUpdateTask(index, 'type', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border rounded"
                      >
                        <option value="Task">Task</option>
                        <option value="Milestone">Milestone</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={task.duration || ''}
                        onChange={(e) => handleUpdateTask(index, 'duration', parseFloat(e.target.value))}
                        className="w-20 px-2 py-1 text-sm border rounded"
                        placeholder="Days"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <DatePickerCell
                        value={task.startDate || ''}
                        onChange={(value) => handleUpdateTask(index, 'startDate', value)}
                        className="w-32"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <DatePickerCell
                        value={task.finishDate || ''}
                        onChange={(value) => handleUpdateTask(index, 'finishDate', value)}
                        className="w-32"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={task.predecessors || ''}
                        onChange={(e) => handleUpdateTask(index, 'predecessors', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border rounded"
                        placeholder="A1010,A1020"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={task.resourcing || ''}
                        onChange={(e) => handleUpdateTask(index, 'resourcing', e.target.value)}
                        className="w-32 px-2 py-1 text-sm border rounded"
                        placeholder="Developer: 16h"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={task.budget || ''}
                        onChange={(e) => handleUpdateTask(index, 'budget', parseFloat(e.target.value))}
                        className="w-24 px-2 py-1 text-sm border rounded"
                        placeholder="Cost"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemoveTask(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Import Actions */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => onBack ? onBack() : navigate(`/projects/${projectId}`)}
            className="px-6 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            {onBack ? 'Back' : 'Cancel'}
          </button>
          <button
            onClick={handleImport}
            disabled={loading || tasks.length === 0}
            className="px-6 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Importing...' : `Import ${tasks.length} Tasks`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportSchedule; 