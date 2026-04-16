import { useState } from 'react'
import { X, ZoomIn, ZoomOut, ExternalLink, ChevronDown } from 'lucide-react'

export default function PDFViewer({ url, title, onConfirmRead }) {
  const [hasScrolled, setHasScrolled] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Use Google Docs viewer for reliable cross-device PDF rendering
  const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`

  function handleIframeLoad() {
    // Give user time to read
  }

  function handleScroll(e) {
    const el = e.target
    // Consider scrolled if they've gone at least 50% through
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.5) {
      setHasScrolled(true)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Document viewer */}
      <div className="flex-1 bg-gray-100 rounded-lg overflow-hidden relative" onScroll={handleScroll}>
        <iframe
          src={viewerUrl}
          className="w-full h-full min-h-[400px] border-0"
          title={title}
          onLoad={handleIframeLoad}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />

        {/* Scroll hint overlay */}
        {!hasScrolled && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-navy-900/90 to-transparent p-4 flex items-center justify-center">
            <div className="flex items-center gap-2 text-white text-sm bg-accent/90 px-4 py-2 rounded-full animate-bounce">
              <ChevronDown size={16} />
              Scroll down to read the full document
            </div>
          </div>
        )}
      </div>

      {/* Fallback link */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-accent mt-2 transition-colors"
      >
        <ExternalLink size={12} />
        Having trouble viewing? Open in new tab
      </a>

      {/* Confirm read checkbox */}
      <div className="mt-4 bg-navy-700 rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => {
              setConfirmed(e.target.checked)
              onConfirmRead(e.target.checked)
            }}
            className="mt-1 w-5 h-5 rounded border-navy-600 bg-navy-800 text-accent focus:ring-accent shrink-0"
          />
          <span className="text-sm text-gray-300">
            I confirm I have read and understood the contents of <span className="text-white font-medium">{title}</span>
          </span>
        </label>
      </div>
    </div>
  )
}
