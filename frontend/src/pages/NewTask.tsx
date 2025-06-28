import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import api from '../services/api'

const NewTask = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    wbsCode: '',
    title: '',
    startDate: '',
    endDate: '',
    isMilestone: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setError(null)
    setLoading(true)
    try {
      await api.post('/tasks', {
        projectId,
        wbsCode: form.wbsCode || '1',
        title: form.title,
        startDate: form.startDate,
        endDate: form.endDate,
        isMilestone: form.isMilestone,
      })
      navigate(`/projects/${projectId}`)
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-md">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Add Task</h1>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">WBS Code</label>
          <input
            type="text"
            name="wbsCode"
            className="input"
            value={form.wbsCode}
            onChange={handleChange}
            placeholder="1.1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            name="title"
            className="input"
            value={form.title}
            onChange={handleChange}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              name="startDate"
              className="input"
              value={form.startDate}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              name="endDate"
              className="input"
              value={form.endDate}
              onChange={handleChange}
              required
            />
          </div>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="milestone"
            name="isMilestone"
            checked={form.isMilestone}
            onChange={handleChange}
            className="mr-2"
          />
          <label htmlFor="milestone" className="text-sm text-gray-700">Milestone</label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (
            <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Add Task
        </button>
      </form>
    </div>
  )
}

export default NewTask 