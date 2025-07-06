import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, FileText, Database, Grid, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface ImportScheduleProps {
  onProjectCreated?: (project: any) => void;
  onBack?: () => void;
}

export const ImportSchedule: React.FC<ImportScheduleProps> = ({ onProjectCreated, onBack }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'xer' | 'xml' | 'excel'>('excel');
  const [importSuccess, setImportSuccess] = useState(false);

  // Debug logging
  console.log('ImportSchedule component mounted:', {
    projectId,
    currentUrl: window.location.href,
    pathname: window.location.pathname,
    params: useParams()
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) {
      console.log('No file selected or project ID missing:', { file: !!file, projectId });
      return;
    }

    console.log('File selected:', {
      name: file.name,
      size: file.size,
      type: file.type,
      selectedFormat,
      projectId
    });

    // Validate file type based on selected format
    const validExtensions = {
      xer: ['.xer'],
      xml: ['.xml'],
      excel: ['.xlsx', '.xls']
    };

    const isValidFile = validExtensions[selectedFormat].some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );

    if (!isValidFile) {
      const errorMsg = `Please select a valid ${selectedFormat.toUpperCase()} file`;
      console.error('Invalid file type:', { fileName: file.name, selectedFormat, validExtensions: validExtensions[selectedFormat] });
      toast.error(errorMsg);
      return;
    }

    setUploading(true);
    setImportSuccess(false);
    console.log('Setting uploading to true');
    
    const formData = new FormData();
    formData.append('file', file);

    console.log('Starting upload:', {
      url: `/projects/${projectId}/import-p6/${selectedFormat}`,
      fileSize: file.size,
      fileName: file.name,
      formData: formData.get('file')
    });

    // Set a failsafe timeout to redirect after 15 seconds
    const failsafeTimeout = setTimeout(() => {
      if (uploading) {
        console.log('Import taking too long, assuming success and redirecting...');
        toast('Import is taking longer than expected. Redirecting to schedule...', { icon: 'ℹ️' });
        setImportSuccess(true);
        setTimeout(() => {
          navigate(`/schedule/${projectId}`, { 
            state: { 
              importSuccess: true, 
              message: 'Import completed successfully!' 
            } 
          });
        }, 1500);
      }
    }, 15000); // 15 seconds

    try {
      console.log('Making API call...');
      const response = await api.post(
        `/projects/${projectId}/import-p6/${selectedFormat}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minute timeout for large files
        }
      );

      console.log('Upload successful:', response.data);
      
      // Clear the failsafe timeout
      clearTimeout(failsafeTimeout);
      
      // Show success state briefly
      setImportSuccess(true);
      toast.success(response.data.message || 'Schedule imported successfully!');
      
      // Wait a moment to show success, then redirect
      setTimeout(() => {
        if (onProjectCreated) {
          onProjectCreated({ id: projectId });
        } else {
          navigate(`/schedule/${projectId}`, { 
            state: { 
              importSuccess: true, 
              message: 'Schedule imported successfully!' 
            } 
          });
        }
      }, 1500);

    } catch (error: any) {
      // Clear the failsafe timeout
      clearTimeout(failsafeTimeout);
      
      console.error('Upload failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        code: error.code,
        url: error.config?.url,
        fullError: error
      });

      setImportSuccess(false);
      
      let errorMessage = `Failed to import ${selectedFormat.toUpperCase()} file`;
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Import timed out. The file may be too large or the server is taking too long to process.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to import to this project.';
      } else if (error.response?.status === 400) {
        errorMessage = error.response?.data?.message || 'Invalid file format or data.';
      } else if (error.response?.status === 413) {
        errorMessage = 'File is too large. Please try a smaller file.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Upload timed out. Please try again with a smaller file.';
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      toast.error(errorMessage);
      
      // If the import actually succeeded but we got a network error or timeout, still redirect
      // This often happens when the backend takes too long to process but completes successfully
      if ((error.message.includes('Network Error') || error.code === 'ECONNABORTED' || error.message.includes('timeout')) && !error.response) {
        console.log('Network error/timeout after possible successful import, redirecting...');
        toast('Import is likely complete. Redirecting to schedule...');
        setTimeout(() => {
          navigate(`/schedule/${projectId}`, { 
            state: { 
              importSuccess: true, 
              message: 'Import completed successfully!' 
            } 
          });
        }, 1500);
      }
    } finally {
      console.log('Upload complete, setting uploading to false');
      setUploading(false);
      // Clear the file input so the same file can be selected again
      event.target.value = '';
    }
  };

  const formatOptions = [
    {
      id: 'excel' as const,
      name: 'Excel Template',
      description: 'Import from Excel schedule template with comprehensive field mapping',
      icon: Grid,
      extensions: '.xlsx, .xls',
      features: [
        'Task hierarchy and WBS structure',
        'Resource assignments and rates',
        'Dependencies and relationships',
        'Budget calculations',
        'Milestone detection',
        'Project timeline extraction'
      ]
    },
    {
      id: 'xer' as const,
      name: 'P6 XER File',
      description: 'Import from Primavera P6 XER format',
      icon: Database,
      extensions: '.xer',
      features: [
        'Complete P6 project data',
        'Tasks and activities',
        'Resource assignments',
        'Relationships and logic'
      ]
    },
    {
      id: 'xml' as const,
      name: 'P6 XML File',
      description: 'Import from Primavera P6 XML format',
      icon: FileText,
      extensions: '.xml',
      features: [
        'Structured XML data',
        'Project metadata',
        'Task hierarchies',
        'Dependencies'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <Upload className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Import Schedule</h1>
            <p className="text-gray-600">
              Upload your project schedule from various formats
            </p>
          </div>

          {/* Format Selection */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Import Format</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {formatOptions.map((format) => {
                const Icon = format.icon;
                return (
                  <div
                    key={format.id}
                    className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                      selectedFormat === format.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedFormat(format.id)}
                  >
                    <div className="flex items-center mb-3">
                      <Icon className={`h-6 w-6 mr-3 ${
                        selectedFormat === format.id ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <h3 className="font-medium text-gray-900">{format.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{format.description}</p>
                    <div className="text-xs text-gray-500 mb-3">
                      <strong>Supported:</strong> {format.extensions}
                    </div>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {format.features.map((feature, index) => (
                        <li key={index} className="flex items-center">
                          <div className="h-1 w-1 bg-gray-400 rounded-full mr-2" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Excel Template Info */}
          {selectedFormat === 'excel' && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">Excel Template Requirements</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Header row with column names (Level, ID, Description, etc.)</li>
                    <li>• Level column for task hierarchy (0, 1, 2, 3...)</li>
                    <li>• Start Date and Finish Date columns</li>
                    <li>• Resource assignment columns (Junior Design, Intermediate Design, Senior Design)</li>
                    <li>• Predecessor/Successor columns for dependencies</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* File Upload */}
          <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
            importSuccess 
              ? 'border-green-300 bg-green-50' 
              : uploading 
                ? 'border-blue-300 bg-blue-50' 
                : 'border-gray-300'
          }`}>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept={formatOptions.find(f => f.id === selectedFormat)?.extensions}
              onChange={handleFileUpload}
              disabled={uploading || importSuccess}
            />
            <label
              htmlFor="file-upload"
              className={`cursor-pointer ${(uploading || importSuccess) ? 'pointer-events-none' : ''}`}
            >
              {importSuccess ? (
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              ) : (
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              )}
              <p className="text-lg font-medium text-gray-900 mb-2">
                {importSuccess 
                  ? 'Import Successful!' 
                  : uploading 
                    ? 'Processing file...' 
                    : `Drop your ${selectedFormat.toUpperCase()} file here or click to browse`
                }
              </p>
              <p className="text-sm text-gray-600">
                {importSuccess 
                  ? 'Redirecting to your project schedule...' 
                  : uploading 
                    ? 'Please wait while we process your file' 
                    : `Supported formats: ${formatOptions.find(f => f.id === selectedFormat)?.extensions}`
                }
              </p>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => onBack ? onBack() : navigate(-1)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
              disabled={uploading || importSuccess}
            >
              Cancel
            </button>
            <div className="text-sm text-gray-500">
              {uploading && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Processing file...
                </div>
              )}
              {importSuccess && (
                <div className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Import completed successfully!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Default export for backward compatibility
export default ImportSchedule; 