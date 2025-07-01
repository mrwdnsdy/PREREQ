import { useState, useEffect } from 'react'
import api from '../services/api'
import WbsTree from '../components/WbsTree'

interface PortfolioData {
  id: string
  title: string
  level: number
  wbsCode: string
  isMilestone: boolean
  startDate?: string
  endDate?: string
  projectId?: string
  project?: {
    id: string
    name: string
    client?: string
  }
  children: PortfolioData[]
  predecessors: any[]
  successors: any[]
}

const PortfolioView = () => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPortfolioData()
  }, [])

  const fetchPortfolioData = async () => {
    try {
      const response = await api.get('/portfolio/wbs')
      setPortfolioData(response.data)
    } catch (err: any) {
      console.error('Failed to fetch portfolio data:', err)
      setError('Failed to load portfolio data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hierarchical view of all projects and their WBS structure
          </p>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hierarchical view of all projects and their WBS structure
          </p>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio View</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hierarchical view of all projects and their WBS structure
        </p>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Portfolio WBS</h2>
        </div>
        <div className="p-6">
          {portfolioData ? (
            <div className="space-y-1">
              <WbsTree data={portfolioData} />
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No portfolio data</h3>
              <p className="mt-1 text-sm text-gray-500">
                Create some projects to see them in the portfolio view.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PortfolioView 