// TZ is pinned to UTC (see vitest.config.ts) so the local-time getters used by
// the formatters produce deterministic results regardless of the host timezone.
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateShort,
  formatDateRange,
  parseDate,
  toISODateString,
} from './dateFormat';

describe('formatDate', () => {
  it('formats an ISO date string as dd-MMM-YYYY', () => {
    expect(formatDate('2025-07-02')).toBe('02-JUL-2025');
    expect(formatDate('2025-12-25')).toBe('25-DEC-2025');
  });

  it('formats a Date object', () => {
    expect(formatDate(new Date('2025-01-01'))).toBe('01-JAN-2025');
  });

  it('formats an ISO datetime string', () => {
    expect(formatDate('2025-03-15T10:30:00Z')).toBe('15-MAR-2025');
  });

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });
});

describe('formatDateShort', () => {
  it('formats as dd-MMM-YY with a 2-digit year', () => {
    expect(formatDateShort('2025-07-02')).toBe('02-JUL-25');
  });

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatDateShort('garbage')).toBe('Invalid Date');
  });
});

describe('formatDateRange', () => {
  it('joins two formatted dates with a dash', () => {
    expect(formatDateRange('2025-01-01', '2025-12-31')).toBe('01-JAN-2025 - 31-DEC-2025');
  });
});

describe('parseDate', () => {
  it('returns a Date for a valid string', () => {
    expect(parseDate('2025-07-02')).toBeInstanceOf(Date);
  });

  it('returns null for an invalid string', () => {
    expect(parseDate('nonsense')).toBeNull();
  });
});

describe('toISODateString', () => {
  it('extracts the YYYY-MM-DD portion of a date', () => {
    expect(toISODateString('2025-07-02T10:30:00Z')).toBe('2025-07-02');
    expect(toISODateString(new Date('2025-07-02T00:00:00Z'))).toBe('2025-07-02');
  });
});
