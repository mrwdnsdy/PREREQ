import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Flag } from 'lucide-react'
import api from '../services/api'

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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['portfolio-root']))

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

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const renderNode = (node: PortfolioData, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children.length > 0
    const isProject = node.projectId && node.level === 1

    return (
      <div key={node.id}>
        <div
          className={`flex items-center py-2 px-4 hover:bg-gray-50 cursor-pointer ${
            isProject ? 'bg-blue-50 border-l-4 border-blue-500' : ''
          }`}
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleNode(node.id)}
              className="mr-2 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          {!hasChildren && <div className="w-6 mr-2" />}

          <div className="flex items-center flex-1">
            {isProject ? (
              <FolderOpen className="w-4 h-4 text-blue-600 mr-2" />
            ) : (
              <div className="w-4 h-4 mr-2" />
            )}
            
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-900">{node.title}</span>
                {node.isMilestone && (
                  <Flag className="w-3 h-3 text-yellow-600 ml-2" />
                )}
              </div>
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <span className="mr-3">WBS: {node.wbsCode}</span>
                {node.startDate && node.endDate && (
                  <span>
                    {new Date(node.startDate).toLocaleDateString()} - {new Date(node.endDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
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

      {/* Portfolio WBS Tree */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Portfolio WBS
          </h3>
          <div className="space-y-1">
            {portfolioData ? (
              renderNode(portfolioData)
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
    </div>
  )
}

export default PortfolioView 