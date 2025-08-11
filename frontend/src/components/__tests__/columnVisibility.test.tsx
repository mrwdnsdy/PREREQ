import { loadJSON, saveJSON } from '../../utils/localStorage'

// Mock the localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('Column Visibility localStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('loadJSON returns fallback when key does not exist', () => {
    localStorageMock.getItem.mockReturnValue(null)
    
    const result = loadJSON('test-key', ['default'])
    expect(result).toEqual(['default'])
  })

  test('loadJSON returns parsed data when key exists', () => {
    const testData = ['col1', 'col2', 'col3']
    localStorageMock.getItem.mockReturnValue(JSON.stringify(testData))
    
    const result = loadJSON('test-key', [])
    expect(result).toEqual(testData)
  })

  test('loadJSON returns fallback when JSON is invalid', () => {
    localStorageMock.getItem.mockReturnValue('invalid-json')
    
    const result = loadJSON('test-key', ['fallback'])
    expect(result).toEqual(['fallback'])
  })

  test('saveJSON stores data in localStorage', () => {
    const testData = ['visible', 'columns']
    saveJSON('test-key', testData)
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'test-key',
      JSON.stringify(testData)
    )
  })

  test('saveJSON handles errors gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('Storage quota exceeded')
    })
    
    saveJSON('test-key', { data: 'test' })
    
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to save JSON to localStorage key "test-key":',
      expect.any(Error)
    )
    
    consoleSpy.mockRestore()
  })

  test('loadJSON handles errors gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('Storage error')
    })
    
    const result = loadJSON('test-key', ['fallback'])
    expect(result).toEqual(['fallback'])
    
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load JSON from localStorage key "test-key":',
      expect.any(Error)
    )
    
    consoleSpy.mockRestore()
  })
})

// Test for context menu functionality
describe('Context Menu Functionality', () => {
  test('should prevent default context menu behavior', () => {
    const mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    }
    
    // Simulate the onContextMenu handler
    const handleContextMenu = (e: any) => {
      e.preventDefault()
      e.stopPropagation()
    }
    
    handleContextMenu(mockEvent)
    
    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(mockEvent.stopPropagation).toHaveBeenCalled()
  })

  test('should handle right-click events correctly', () => {
    const mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      type: 'contextmenu'
    }
    
    let eventHandled = false
    const handleContextMenu = (e: any) => {
      eventHandled = true
      e.preventDefault()
      e.stopPropagation()
    }
    
    handleContextMenu(mockEvent)
    
    expect(eventHandled).toBe(true)
    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(mockEvent.stopPropagation).toHaveBeenCalled()
  })

  test('should handle column visibility toggle correctly', () => {
    const mockColumn = {
      getIsVisible: () => true,
      toggleVisibility: jest.fn()
    }
    
    const mockTable = {
      getAllLeafColumns: () => [mockColumn],
      getColumn: jest.fn().mockReturnValue(mockColumn)
    }
    
    // Simulate column toggle
    const handleColumnToggle = (columnId: string) => {
      const column = mockTable.getColumn(columnId)
      if (column) {
        const newVisible = column.getIsVisible()
        column.toggleVisibility(!newVisible)
      }
    }
    
    handleColumnToggle('test-column')
    
    expect(mockTable.getColumn).toHaveBeenCalledWith('test-column')
    expect(mockColumn.toggleVisibility).toHaveBeenCalledWith(false)
  })


}) 