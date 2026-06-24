import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MilestoneBadge from './MilestoneBadge'

describe('MilestoneBadge', () => {
  it('renders nothing when isMilestone is false', () => {
    const { container } = render(<MilestoneBadge isMilestone={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the badge when isMilestone is true', () => {
    render(<MilestoneBadge isMilestone={true} />)
    expect(screen.getByText('Milestone')).toBeInTheDocument()
  })

  it('applies an extra className when provided', () => {
    render(<MilestoneBadge isMilestone={true} className="custom-class" />)
    expect(screen.getByText('Milestone')).toHaveClass('custom-class')
  })
})
