import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

/**
 * Renders a PDF URL as a canvas image. Exposes the same interface as an <img>:
 * - onLoad callback when rendered
 * - onError callback on failure
 * - ref gives access to the canvas element (like imageRef)
 * - clientWidth/clientHeight/naturalWidth/naturalHeight available on ref
 */
const PDFRenderer = forwardRef(function PDFRenderer({ src, alt, className, style, onLoad, onError, draggable }, ref) {
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const sizeRef = useRef({ width: 0, height: 0 })

  // Expose canvas as ref with img-like properties
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
    setError(false)

    let cancelled = false

    async function renderPDF() {
      try {
        const pdfjsLib = await import('pdfjs-dist')

        // Disable worker — runs in main thread. Simpler and avoids worker loading issues.
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''

        const loadingTask = pdfjsLib.getDocument({
          url: src,
          disableWorker: true,
          isEvalSupported: false,
        })
        const pdf = await loadingTask.promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        if (cancelled) return

        // Render at 2x for sharpness
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
          setError(true)
          onError?.(err)
        }
      }
    }

    renderPDF()
    return () => { cancelled = true }
  }, [src])

  if (error) {
    return (
      <div className="w-[800px] h-[600px] bg-white flex items-center justify-center">
        <p className="text-slate-400 text-sm">Failed to load PDF</p>
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
      {!loaded && !error && (
        <div className="w-[800px] h-[400px] bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Rendering PDF...</p>
          </div>
        </div>
      )}
    </>
  )
})

export default PDFRenderer

/**
 * Check if a URL points to a PDF
 */
export function isPDF(url) {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('content-type=application/pdf')
}
