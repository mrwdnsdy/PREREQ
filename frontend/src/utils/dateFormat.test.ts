/**
 * Test file to demonstrate the new date formatting
 * You can run this in your browser console or Node.js
 */

import { formatDate, formatDateShort, formatDateRange } from './dateFormat';

// Example usage:
console.log('=== Date Formatting Examples ===');

// Test with different date formats
const testDates = [
  '2025-07-02',           // ISO format
  '2025-12-25',           // Christmas
  new Date('2025-01-01'), // New Year
  '2025-03-15T10:30:00Z', // ISO with time
];

testDates.forEach(date => {
  console.log(`Input: ${date}`);
  console.log(`formatDate: ${formatDate(date)}`);
  console.log(`formatDateShort: ${formatDateShort(date)}`);
  console.log('---');
});

// Test date range
console.log('Date Range Examples:');
console.log(`Project: ${formatDateRange('2025-01-01', '2025-12-31')}`);
console.log(`Sprint: ${formatDateRange('2025-07-01', '2025-07-14')}`);

export {};

/*
Expected Output:
================
Input: 2025-07-02
formatDate: 02-JUL-2025
formatDateShort: 02-JUL-25

Input: 2025-12-25
formatDate: 25-DEC-2025
formatDateShort: 25-DEC-25

Input: Wed Jan 01 2025 00:00:00 GMT-0800 (PST)
formatDate: 01-JAN-2025
formatDateShort: 01-JAN-25

Input: 2025-03-15T10:30:00Z
formatDate: 15-MAR-2025
formatDateShort: 15-MAR-25

Date Range Examples:
Project: 01-JAN-2025 - 31-DEC-2025
Sprint: 01-JUL-2025 - 14-JUL-2025
*/ 