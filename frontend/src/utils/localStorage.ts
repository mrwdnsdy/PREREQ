/**
 * localStorage utilities for JSON serialization/deserialization
 */

/**
 * Load JSON data from localStorage with fallback
 * @param key - localStorage key
 * @param fallback - Default value if key doesn't exist or is invalid
 * @returns Parsed JSON data or fallback value
 */
export const loadJSON = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key)
    if (item === null) {
      return fallback
    }
    return JSON.parse(item)
  } catch (error) {
    console.warn(`Failed to load JSON from localStorage key "${key}":`, error)
    return fallback
  }
}

/**
 * Save JSON data to localStorage
 * @param key - localStorage key
 * @param value - Data to serialize and store
 */
export const saveJSON = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to save JSON to localStorage key "${key}":`, error)
  }
} 