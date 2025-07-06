import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, FileText, Calendar } from 'lucide-react'
import api from '../services/api'
import { DatePickerCell } from '../components/DatePickerCell'

interface ProjectForm {
  name: string
  client: string
  startDate: string
  endDate: string
  budget: string | number
}

const NewProject = () => {
  const navigate = useNavigate()
  const [selectedMethod, setSelectedMethod] = useState<'traditional' | 'import' | null>(null)
  const [projectData, setProjectData] = useState<ProjectForm>({
    name: '',
    client: '',
    startDate: '',
    endDate: '',
    budget: '' as string | number,
  })
  const [importProjectName, setImportProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setProjectData((prev) => ({ ...prev, [name]: value }))
  }

  const handleDateChange = (name: string, value: string) => {
    setProjectData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Traditional project creation with user-provided data
      const payload: Record<string, any> = {
        name: projectData.name,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
      }
      if (projectData.client) payload.client = projectData.client
      if (projectData.budget) payload.budget = Number(projectData.budget)

      const res = await api.post('/projects', payload)
      navigate(`/projects/${res.data.id}`)
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Create a project for import with user-provided name
      const payload = {
        name: importProjectName || 'New Project from Schedule Import',
        startDate: new Date().toISOString().split('T')[0], // Today's date as placeholder
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // One year from today as placeholder
      }
      
      const res = await api.post('/projects', payload)
      
      // Navigate to import page with the new project ID
      navigate(`/projects/${res.data.id}/import-schedule`)
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to create project for import')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Project</h1>

        {!selectedMethod ? (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">How would you like to create your project?</h2>
            
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600">{error}</p>
              </div>
            )}
            
            <div className="space-y-4">
              {/* Traditional Project Option */}
              <button
                onClick={() => setSelectedMethod('traditional')}
                className="w-full text-left p-6 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-start">
                  <FileText className="w-6 h-6 text-blue-600 mr-3 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">Traditional Project</h3>
                    <p className="text-gray-600 text-base mb-4">
                      Start with basic project information and add tasks manually as you go.
                    </p>
                    <div className="flex items-center text-base text-blue-600">
                      <span>Get started</span>
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>

              {/* Import Option */}
              <button
                onClick={() => setSelectedMethod('import')}
                className="w-full text-left p-6 border-2 border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all group"
              >
                <div className="flex items-start">
                  <Upload className="w-6 h-6 text-green-600 mr-3 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">From Schedule Import</h3>
                    <p className="text-gray-600 text-base mb-4">
                      Import an existing schedule from P6 XER, P6 XML, or Excel format.
                    </p>
                    <div className="flex items-center text-base text-green-600">
                      <span>Import schedule</span>
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : selectedMethod === 'import' ? (
          // Import project form
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Project Information for Import
            </h2>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    value={importProjectName}
                    onChange={(e) => setImportProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Enter project name"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    This name will be used for your project. You can change it later if needed.
                  </p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <Upload className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-green-900 mb-2">What happens next?</h3>
                    <ul className="text-sm text-green-800 space-y-1">
                      <li>• A new project will be created with your chosen title</li>
                      <li>• You'll be taken to the import page to upload your schedule file</li>
                      <li>• The schedule data will populate your project automatically</li>
                      <li>• Project dates and details will be extracted from your file</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setSelectedMethod(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {loading && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {loading ? 'Creating Project...' : 'Continue to Import'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          // Traditional project form
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Project Information
            </h2>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
        <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
          <input
            type="text"
                    value={projectData.name}
                    onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            required
          />
        </div>

        <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Client</label>
          <input
            type="text"
                    value={projectData.client}
                    onChange={(e) => setProjectData({ ...projectData, client: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>

          <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
            <input
              type="date"
                    value={projectData.startDate}
                    onChange={(e) => setProjectData({ ...projectData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    End Date
                  </label>
            <input
              type="date"
                    value={projectData.endDate}
                    onChange={(e) => setProjectData({ ...projectData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

        <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">Budget</label>
          <input
            type="number"
                    value={projectData.budget}
                    onChange={(e) => setProjectData({ ...projectData, budget: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="0.00"
            step="0.01"
          />
        </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setSelectedMethod(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                >
                  Back
                </button>
        <button
          type="submit"
          disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50"
        >
                  {loading && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          Create Project
        </button>
              </div>
      </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default NewProject 