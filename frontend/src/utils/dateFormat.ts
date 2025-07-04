/**
 * Date formatting utilities for consistent date display across the application
 */

const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

/**
 * Formats a date to dd-MMM-YYYY format (e.g., 02-JUL-2025)
 * @param dateInput - Date string or Date object
 * @returns Formatted date string
 */
export const formatDate = (dateInput: string | Date): string => {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Formats a date to dd-MMM-YY format (e.g., 02-JUL-25) for compact display
 * @param dateInput - Date string or Date object
 * @returns Formatted date string
 */
export const formatDateShort = (dateInput: string | Date): string => {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    
    return `${day}-${month}-${year}`;
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Formats a date range to "dd-MMM-YYYY - dd-MMM-YYYY" format
 * @param startDate - Start date string or Date object
 * @param endDate - End date string or Date object
 * @returns Formatted date range string
 */
export const formatDateRange = (startDate: string | Date, endDate: string | Date): string => {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return `${start} - ${end}`;
};

/**
 * Parses a date string and returns a Date object
 * @param dateString - Date string in various formats
 * @returns Date object or null if invalid
 */
export const parseDate = (dateString: string): Date | null => {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

/**
 * Converts a date to ISO string format (YYYY-MM-DD) for input fields
 * @param dateInput - Date string or Date object
 * @returns ISO date string
 */
export const toISODateString = (dateInput: string | Date): string => {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}; 