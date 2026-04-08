import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker from public folder — same origin, no CORS issues
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const PDFRenderer = forwardRef(function PDFRenderer({ src, alt, className, style, onLoad, onError, draggable }, ref) {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const sizeRef = useRef({ width: 0, height: 0 })

  useImperativeHandle(ref, () => {
    const canvas = canvasRef.current
    if (!canvas) return {}
    return {
      get clientWidth() { return canvas.clientWidth },
      get clientHeight() { return canvas.clientHeight },
      get naturalWidth() { return sizeRef.current.width },
      get naturalHeight() { return sizeRef.current.height },
      getBoundingClientRect: () => canvas.getBoundingClientRect(),
      tagName: 'CANVAS',
    }
  })

  useEffect(() => {
    if (!src) return
    setLoaded(false)
    setError(null)

    let cancelled = false

    async function renderPDF() {
      try {
        // Fetch the PDF as ArrayBuffer
        const response = await fetch(src)
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching PDF`)
        const data = await response.arrayBuffer()
        if (cancelled) return

        // Load the PDF document
        const pdf = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return

        // Get first page
        const page = await pdf.getPage(1)
        if (cancelled) return

        // Render at 2x scale for sharpness on retina displays
        const scale = 2
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = viewport.width
        canvas.height = viewport.height
        sizeRef.current = { width: viewport.width, height: viewport.height }

        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise

        if (cancelled) return
        setLoaded(true)
        onLoad?.()
      } catch (err) {
        console.error('PDF render error:', err)
        if (!cancelled) {
          setError(err.message || 'Unknown error')
          onError?.(err)
        }
      }
    }

    renderPDF()
    return () => { cancelled = true }
  }, [src])

  if (error) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100, background: '#f8fafc' }}>
        <p className="text-slate-400 text-xs text-center px-2">PDF failed: {error}</p>
      </div>
    )
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          ...style,
          display: loaded ? 'block' : 'none',
        }}
        draggable={draggable}
      />
      {!loaded && (
        <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100, background: '#f8fafc' }}>
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-1" />
            <p className="text-slate-400 text-[10px]">Rendering PDF...</p>
          </div>
        </div>
      )}
    </>
  )
})

export default PDFRenderer

export function isPDF(url) {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('content-type=application/pdf')
}
