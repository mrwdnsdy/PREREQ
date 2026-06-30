import { useState } from 'react'
import { X } from 'lucide-react'

// Shown only in the public demo build (see services/api.ts). Tells the visitor
// the data is sample data served entirely in their browser and resets on
// refresh. Dismissible.
const DEMO = import.meta.env.VITE_DEMO === '1' && !import.meta.env.VITE_API_URL

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (!DEMO || dismissed) return null

  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg">
      <span className="font-medium">Demo mode</span>
      <span className="hidden sm:inline text-amber-700">— sample data, runs in your browser, resets on refresh.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo banner"
        className="ml-1 rounded-full p-0.5 text-amber-700 hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
