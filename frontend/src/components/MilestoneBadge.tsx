import { Flag } from 'lucide-react'

interface MilestoneBadgeProps {
  isMilestone: boolean
  className?: string
}

const MilestoneBadge: React.FC<MilestoneBadgeProps> = ({ isMilestone, className = '' }) => {
  if (!isMilestone) return null

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ${className}`}>
      <Flag className="w-3 h-3 mr-1" />
      Milestone
    </span>
  )
}

export default MilestoneBadge 