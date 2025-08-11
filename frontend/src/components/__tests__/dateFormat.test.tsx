import { formatDate } from '../../utils/dateFormat'

describe('formatDate', () => {
  test('formats JS Date object correctly', () => {
    const date = new Date(2025, 6, 10) // July 10, 2025 (month is 0-indexed)
    expect(formatDate(date)).toBe('10-JUL-2025')
  })

  test('formats ISO string correctly', () => {
    const date = new Date(2025, 8, 7) // September 7, 2025 (month is 0-indexed)
    expect(formatDate(date)).toBe('07-SEP-2025')
  })

  test('returns empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  test('returns empty string for invalid date string', () => {
    expect(formatDate('invalid-date')).toBe('')
  })

  test('returns empty string for invalid Date object', () => {
    const invalidDate = new Date('invalid')
    expect(formatDate(invalidDate)).toBe('')
  })

  test('handles different date formats', () => {
    const date1 = new Date(2025, 0, 1) // January 1, 2025
    const date2 = new Date(2025, 11, 31) // December 31, 2025
    const date3 = new Date(2025, 2, 15) // March 15, 2025
    
    expect(formatDate(date1)).toBe('01-JAN-2025')
    expect(formatDate(date2)).toBe('31-DEC-2025')
    expect(formatDate(date3)).toBe('15-MAR-2025')
  })

  test('handles edge cases', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(undefined as any)).toBe('')
  })
}) 