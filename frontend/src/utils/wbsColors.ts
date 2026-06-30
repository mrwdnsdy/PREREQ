// Shared WBS-level color scheme.
//
// These helpers were originally private to `components/TaskTable.tsx`. They are
// extracted here so the schedule **canvas** can color WBS layer boxes with the
// exact same per-level palette as the table — one source of truth, no drift.
//
// Level → color order (mirrors the table): 0 slate, 1 blue, 2 green, 3 purple,
// 4 orange, 5 pink, 6 indigo, 7 teal, 8 red, 9 amber, 10+ gray.

// Derive a numeric WBS level from a dotted path ("1.2.3" → 3; "0" → 0).
export const getWbsLevel = (wbsPath: string): number => {
  if (!wbsPath) return 1
  // For level 0 (root project), wbsPath is "0"
  if (wbsPath === '0') return 0
  // Count meaningful levels, excluding trailing zeros
  const parts = wbsPath.split('.').filter((part) => part !== '0' && part !== '')
  return Math.max(1, parts.length)
}

export const getRowBackgroundColor = (wbsPath: string): string => {
  const level = getWbsLevel(wbsPath)
  const colors = [
    'bg-slate-50', // Level 0: Light slate - Project root
    'bg-blue-50', // Level 1: Light blue - Project phases
    'bg-green-50', // Level 2: Light green - Major work packages
    'bg-purple-50', // Level 3: Light purple - Work packages
    'bg-orange-50', // Level 4: Light orange - Activities
    'bg-pink-50', // Level 5: Light pink - Sub-activities
    'bg-indigo-50', // Level 6: Light indigo - Tasks
    'bg-teal-50', // Level 7: Light teal - Sub-tasks
    'bg-red-50', // Level 8: Light red - Details
    'bg-amber-50', // Level 9: Light amber - Sub-details
    'bg-gray-50', // Level 10: Light gray - Maximum depth
  ]
  return colors[Math.min(level, colors.length - 1)] || 'bg-white'
}

export const getWbsTextColor = (wbsPath: string): string => {
  const level = getWbsLevel(wbsPath)
  const colors = [
    'text-slate-900 font-black', // Level 0: Very dark slate, black weight - Project root
    'text-blue-800 font-bold', // Level 1: Dark blue, bold
    'text-green-800 font-bold', // Level 2: Dark green, bold
    'text-purple-800 font-semibold', // Level 3: Dark purple, semibold
    'text-orange-800 font-semibold', // Level 4: Dark orange, semibold
    'text-pink-800 font-medium', // Level 5: Dark pink, medium
    'text-indigo-800 font-medium', // Level 6: Dark indigo, medium
    'text-teal-800', // Level 7: Dark teal, normal
    'text-red-800', // Level 8: Dark red, normal
    'text-amber-800', // Level 9: Dark amber, normal
    'text-gray-800', // Level 10: Dark gray, normal
  ]
  return colors[Math.min(level, colors.length - 1)] || 'text-gray-600'
}

export const getTaskNameTextColor = (wbsPath: string): string => {
  const level = getWbsLevel(wbsPath)
  const colors = [
    'text-slate-900 font-black', // Level 0: Very dark slate, black weight - Project root
    'text-blue-900 font-bold', // Level 1: Very dark blue, bold
    'text-green-900 font-bold', // Level 2: Very dark green, bold
    'text-purple-800 font-semibold', // Level 3: Dark purple, semibold
    'text-orange-800 font-semibold', // Level 4: Dark orange, semibold
    'text-pink-800 font-medium', // Level 5: Dark pink, medium
    'text-indigo-800 font-medium', // Level 6: Dark indigo, medium
    'text-teal-700', // Level 7: Dark teal, normal
    'text-red-700', // Level 8: Dark red, normal
    'text-amber-700', // Level 9: Dark amber, normal
    'text-gray-700', // Level 10: Dark gray, normal
  ]
  return colors[Math.min(level, colors.length - 1)] || 'text-gray-700'
}

export const getBorderColor = (wbsPath: string): string => {
  const level = getWbsLevel(wbsPath)
  const colors = [
    'border-slate-300', // Level 0
    'border-blue-200', // Level 1
    'border-green-200', // Level 2
    'border-purple-200', // Level 3
    'border-orange-200', // Level 4
    'border-pink-200', // Level 5
    'border-indigo-200', // Level 6
    'border-teal-200', // Level 7
    'border-red-200', // Level 8
    'border-amber-200', // Level 9
    'border-gray-200', // Level 10
  ]
  return colors[Math.min(level, colors.length - 1)] || 'border-gray-200'
}

// Bolder, more visible theme for a canvas WBS group box, derived from the same
// per-level palette. `box` = solid 2px border + light tint background;
// `accent` = thick colored left stripe; `badge` = filled WBS-code chip.
// Full literal class strings (no interpolation) so Tailwind's JIT keeps them.
export interface WbsGroupTheme {
  box: string
  accent: string
  badge: string
}

export function wbsGroupTheme(wbsPath: string): WbsGroupTheme {
  const level = getWbsLevel(wbsPath)
  const themes: WbsGroupTheme[] = [
    { box: 'border-slate-400 bg-slate-50/70', accent: 'border-l-4 border-l-slate-500', badge: 'bg-slate-600 text-white' }, // 0
    { box: 'border-blue-400 bg-blue-50/70', accent: 'border-l-4 border-l-blue-500', badge: 'bg-blue-600 text-white' }, // 1
    { box: 'border-green-400 bg-green-50/70', accent: 'border-l-4 border-l-green-500', badge: 'bg-green-600 text-white' }, // 2
    { box: 'border-purple-400 bg-purple-50/70', accent: 'border-l-4 border-l-purple-500', badge: 'bg-purple-600 text-white' }, // 3
    { box: 'border-orange-400 bg-orange-50/70', accent: 'border-l-4 border-l-orange-500', badge: 'bg-orange-600 text-white' }, // 4
    { box: 'border-pink-400 bg-pink-50/70', accent: 'border-l-4 border-l-pink-500', badge: 'bg-pink-600 text-white' }, // 5
    { box: 'border-indigo-400 bg-indigo-50/70', accent: 'border-l-4 border-l-indigo-500', badge: 'bg-indigo-600 text-white' }, // 6
    { box: 'border-teal-400 bg-teal-50/70', accent: 'border-l-4 border-l-teal-500', badge: 'bg-teal-600 text-white' }, // 7
    { box: 'border-red-400 bg-red-50/70', accent: 'border-l-4 border-l-red-500', badge: 'bg-red-600 text-white' }, // 8
    { box: 'border-amber-400 bg-amber-50/70', accent: 'border-l-4 border-l-amber-500', badge: 'bg-amber-600 text-white' }, // 9
    { box: 'border-gray-400 bg-gray-50/70', accent: 'border-l-4 border-l-gray-500', badge: 'bg-gray-600 text-white' }, // 10
  ]
  return themes[Math.min(level, themes.length - 1)]
}
