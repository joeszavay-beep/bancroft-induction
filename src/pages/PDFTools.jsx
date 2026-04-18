import { useState, useEffect, useRef, useCallback } from 'react'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Merge, Scissors, Minimize2, Droplets, Hash, ImageIcon,
  Upload, Download, Trash2, GripVertical, Loader2, FileText, X, Check,
  ChevronDown
} from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// ── Constants ──
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

const TOOLS = [
  { id: 'merge', title: 'Merge PDF', desc: 'Combine multiple PDFs into one file', color: '#2563EB', Icon: Merge },
  { id: 'split', title: 'Split PDF', desc: 'Extract or split pages from a PDF', color: '#7C3AED', Icon: Scissors },
  { id: 'compress', title: 'Compress PDF', desc: 'Reduce PDF file size', color: '#059669', Icon: Minimize2 },
  { id: 'watermark', title: 'Add Watermark', desc: 'Stamp text across PDF pages', color: '#D29922', Icon: Droplets },
  { id: 'pagenumbers', title: 'Add Page Numbers', desc: 'Number every page automatically', color: '#0891B2', Icon: Hash },
  { id: 'imagestopdf', title: 'Images to PDF', desc: 'Convert images into a PDF document', color: '#EA580C', Icon: ImageIcon },
]

// ── Helpers ──
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

async function loadPdfDoc(arrayBuffer) {
  try {
    return await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
  } catch {
    throw new Error('Failed to load PDF. The file may be encrypted or corrupted.')
  }
}

async function getPdfPageCount(arrayBuffer) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    return pdf.numPages
  } catch {
    return null
  }
}

async function renderPageThumbnail(arrayBuffer, pageNum, width = 120) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const page = await pdf.getPage(pageNum)
  const vp = page.getViewport({ scale: 1 })
  const scale = width / vp.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Reusable Drop Zone ──
function DropZone({ accept, multiple, onFiles, label, children }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDragOver(e) { e.preventDefault(); setDragging(true) }
  function handleDragLeave() { setDragging(false) }
  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  }
  function handleChange(e) {
    const files = Array.from(e.target.files)
    processFiles(files)
    e.target.value = ''
  }
  function processFiles(files) {
    const oversize = files.filter(f => f.size > MAX_FILE_SIZE)
    if (oversize.length) {
      toast.error(`File(s) over 100 MB limit: ${oversize.map(f => f.name).join(', ')}`)
      files = files.filter(f => f.size <= MAX_FILE_SIZE)
    }
    if (files.length) onFiles(files)
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="cursor-pointer rounded-xl transition-all"
        style={{
          border: `2px dashed ${dragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
          backgroundColor: dragging ? 'var(--primary-color-alpha, rgba(27,111,200,0.05))' : 'var(--bg-card)',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <Upload size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 0.5rem' }} />
        <p style={{ color: 'var(--text-main)', fontSize: '0.875rem', fontWeight: 500 }}>
          {label || 'Drag & drop files here'}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>or click to browse</p>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={handleChange} className="hidden" />
      </div>
      {children}
    </div>
  )
}

// ── Sortable file list helper (simple drag reorder) ──
function useSortableList(initial) {
  const [items, setItems] = useState(initial || [])
  const dragIdx = useRef(null)
  const overIdx = useRef(null)

  useEffect(() => { setItems(initial || []) }, [initial])

  function onDragStart(i) { dragIdx.current = i }
  function onDragOver(e, i) { e.preventDefault(); overIdx.current = i }
  function onDragEnd() {
    if (dragIdx.current === null || overIdx.current === null) return
    const from = dragIdx.current
    const to = overIdx.current
    if (from === to) { dragIdx.current = null; overIdx.current = null; return }
    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    dragIdx.current = null
    overIdx.current = null
  }

  return { items, setItems, onDragStart, onDragOver, onDragEnd }
}

// ── Processing spinner ──
function Processing({ text }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
      <span style={{ color: 'var(--text-main)', fontSize: '0.875rem' }}>{text || 'Processing...'}</span>
    </div>
  )
}

// ── Action button ──
function ActionButton({ onClick, disabled, color, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
      style={{ backgroundColor: disabled ? '#9CA3AF' : color }}
    >
      {children}
    </button>
  )
}

// ═══════════════════════════════════════════
// Tool 1: Merge PDF
// ═══════════════════════════════════════════
function MergePDF() {
  const [files, setFiles] = useState([])
  const [processing, setProcessing] = useState(false)
  const sortable = useSortableList(files)

  async function addFiles(newFiles) {
    const pdfFiles = newFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfFiles.length !== newFiles.length) toast.error('Only PDF files are accepted')
    const entries = []
    for (const f of pdfFiles) {
      const buf = await f.arrayBuffer()
      const pages = await getPdfPageCount(buf)
      entries.push({ name: f.name, size: f.size, pages, buffer: buf, id: Date.now() + Math.random() })
    }
    setFiles(prev => [...prev, ...entries])
    sortable.setItems(prev => [...prev, ...entries])
  }

  function removeFile(idx) {
    sortable.setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function merge() {
    if (sortable.items.length < 2) { toast.error('Add at least 2 PDF files'); return }
    setProcessing(true)
    try {
      const merged = await PDFDocument.create()
      for (const file of sortable.items) {
        const doc = await loadPdfDoc(file.buffer)
        const copied = await merged.copyPages(doc, doc.getPageIndices())
        copied.forEach(p => merged.addPage(p))
      }
      const bytes = await merged.save()
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf')
      toast.success('PDFs merged successfully')
    } catch (err) {
      toast.error(err.message || 'Merge failed')
    }
    setProcessing(false)
  }

  return (
    <div className="space-y-4">
      <DropZone accept=".pdf" multiple onFiles={addFiles} label="Drag & drop PDF files here" />
      {sortable.items.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          {sortable.items.map((f, i) => (
            <div
              key={f.id}
              draggable
              onDragStart={() => sortable.onDragStart(i)}
              onDragOver={e => sortable.onDragOver(e, i)}
              onDragEnd={sortable.onDragEnd}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/5"
              style={{ borderBottom: i < sortable.items.length - 1 ? '1px solid var(--border-color)' : 'none', backgroundColor: 'var(--bg-card)' }}
            >
              <GripVertical size={16} className="cursor-grab shrink-0" style={{ color: 'var(--text-muted)' }} />
              <FileText size={16} className="shrink-0" style={{ color: '#2563EB' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}>{f.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(f.size)}{f.pages ? ` \u00B7 ${f.pages} pages` : ''}</p>
              </div>
              <button onClick={() => removeFile(i)} className="p-1 rounded hover:bg-red-50 transition-colors">
                <Trash2 size={14} style={{ color: '#EF4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}
      {processing && <Processing text="Merging PDFs..." />}
      {sortable.items.length >= 2 && !processing && (
        <ActionButton onClick={merge} color="#2563EB">
          <div className="flex items-center gap-2"><Merge size={16} /> Merge {sortable.items.length} Files</div>
        </ActionButton>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Tool 2: Split PDF
// ═══════════════════════════════════════════
function SplitPDF() {
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [thumbnails, setThumbnails] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [mode, setMode] = useState('select') // 'select' | 'every'
  const [everyN, setEveryN] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [loadingThumbs, setLoadingThumbs] = useState(false)

  async function handleFile(files) {
    const f = files[0]
    if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files'); return }
    const buf = await f.arrayBuffer()
    setFile(f)
    setBuffer(buf)
    setSelected(new Set())
    setLoadingThumbs(true)
    try {
      const pageCount = await getPdfPageCount(buf)
      const thumbs = []
      for (let i = 1; i <= pageCount; i++) {
        const thumb = await renderPageThumbnail(buf, i, 140)
        thumbs.push(thumb)
      }
      setThumbnails(thumbs)
    } catch (err) {
      toast.error('Failed to load PDF: ' + (err.message || ''))
    }
    setLoadingThumbs(false)
  }

  function togglePage(i) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  async function split() {
    if (!buffer) return
    setProcessing(true)
    try {
      const srcDoc = await loadPdfDoc(buffer)
      const total = srcDoc.getPageCount()

      if (mode === 'select') {
        if (selected.size === 0) { toast.error('Select at least one page'); setProcessing(false); return }
        const newDoc = await PDFDocument.create()
        const indices = Array.from(selected).sort((a, b) => a - b)
        const copied = await newDoc.copyPages(srcDoc, indices)
        copied.forEach(p => newDoc.addPage(p))
        const bytes = await newDoc.save()
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'extracted-pages.pdf')
        toast.success(`Extracted ${indices.length} pages`)
      } else {
        const n = Math.max(1, Math.min(everyN, total))
        const chunks = []
        for (let start = 0; start < total; start += n) {
          const end = Math.min(start + n, total)
          const indices = []
          for (let j = start; j < end; j++) indices.push(j)
          chunks.push(indices)
        }
        for (let c = 0; c < chunks.length; c++) {
          const newDoc = await PDFDocument.create()
          const copied = await newDoc.copyPages(srcDoc, chunks[c])
          copied.forEach(p => newDoc.addPage(p))
          const bytes = await newDoc.save()
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `split-part-${c + 1}.pdf`)
        }
        toast.success(`Split into ${chunks.length} files`)
      }
    } catch (err) {
      toast.error(err.message || 'Split failed')
    }
    setProcessing(false)
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <DropZone accept=".pdf" onFiles={handleFile} label="Drag & drop a PDF file here" />
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <FileText size={16} style={{ color: '#7C3AED' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(file.size)} &middot; {thumbnails.length} pages</p>
            </div>
            <button onClick={() => { setFile(null); setBuffer(null); setThumbnails([]); setSelected(new Set()) }} className="p-1 rounded hover:bg-red-50"><X size={14} style={{ color: '#EF4444' }} /></button>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setMode('select')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: mode === 'select' ? '#7C3AED' : 'var(--bg-card)', color: mode === 'select' ? '#fff' : 'var(--text-main)', border: '1px solid var(--border-color)' }}
            >Extract selected pages</button>
            <button
              onClick={() => setMode('every')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: mode === 'every' ? '#7C3AED' : 'var(--bg-card)', color: mode === 'every' ? '#fff' : 'var(--text-main)', border: '1px solid var(--border-color)' }}
            >Split every N pages</button>
          </div>

          {mode === 'every' && (
            <div className="flex items-center gap-2">
              <label className="text-sm" style={{ color: 'var(--text-main)' }}>Split every</label>
              <input
                type="number" min={1} max={thumbnails.length || 1} value={everyN}
                onChange={e => setEveryN(parseInt(e.target.value) || 1)}
                className="w-20 px-2 py-1 rounded-md text-sm"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-main)' }}>page(s)</span>
            </div>
          )}

          {loadingThumbs ? (
            <Processing text="Loading page previews..." />
          ) : mode === 'select' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {thumbnails.map((thumb, i) => (
                <div
                  key={i}
                  onClick={() => togglePage(i)}
                  className="cursor-pointer rounded-lg overflow-hidden transition-all relative"
                  style={{
                    border: selected.has(i) ? '3px solid #7C3AED' : '2px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                  }}
                >
                  <img src={thumb} alt={`Page ${i + 1}`} className="w-full h-auto" />
                  <div className="absolute bottom-0 left-0 right-0 text-center py-0.5 text-[10px] font-medium" style={{ backgroundColor: selected.has(i) ? '#7C3AED' : 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    {selected.has(i) && <Check size={10} className="inline mr-0.5" />}
                    Page {i + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {processing && <Processing text="Splitting PDF..." />}
          {!processing && (
            <ActionButton onClick={split} color="#7C3AED">
              <div className="flex items-center gap-2"><Scissors size={16} /> {mode === 'select' ? `Extract ${selected.size} Pages` : 'Split PDF'}</div>
            </ActionButton>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Tool 3: Compress PDF
// ═══════════════════════════════════════════
function CompressPDF() {
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [quality, setQuality] = useState('medium') // low, medium, high
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)

  async function handleFile(files) {
    const f = files[0]
    if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files'); return }
    const buf = await f.arrayBuffer()
    setFile(f)
    setBuffer(buf)
    setResult(null)
  }

  async function compress() {
    if (!buffer) return
    setProcessing(true)
    setResult(null)
    try {
      const srcDoc = await loadPdfDoc(buffer)

      // Strip metadata
      srcDoc.setTitle('')
      srcDoc.setAuthor('')
      srcDoc.setSubject('')
      srcDoc.setKeywords([])
      srcDoc.setProducer('')
      srcDoc.setCreator('')

      // Try to flatten form fields
      try {
        const form = srcDoc.getForm()
        form.flatten()
      } catch {
        // no form, that's fine
      }

      // Save with options based on quality
      const options = {}
      if (quality === 'low') {
        options.useObjectStreams = true
        options.addDefaultPage = false
      } else if (quality === 'medium') {
        options.useObjectStreams = true
      }

      const bytes = await srcDoc.save(options)
      const compressedBlob = new Blob([bytes], { type: 'application/pdf' })

      setResult({
        originalSize: file.size,
        compressedSize: compressedBlob.size,
        blob: compressedBlob,
      })
      toast.success('PDF compressed')
    } catch (err) {
      toast.error(err.message || 'Compression failed')
    }
    setProcessing(false)
  }

  const qualityLabels = { low: 'Low (max compression)', medium: 'Medium', high: 'High (minimal compression)' }
  const qualityColors = { low: '#059669', medium: '#D29922', high: '#2563EB' }

  return (
    <div className="space-y-4">
      {!file ? (
        <DropZone accept=".pdf" onFiles={handleFile} label="Drag & drop a PDF to compress" />
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <FileText size={16} style={{ color: '#059669' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(file.size)}</p>
            </div>
            <button onClick={() => { setFile(null); setBuffer(null); setResult(null) }} className="p-1 rounded hover:bg-red-50"><X size={14} style={{ color: '#EF4444' }} /></button>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-main)' }}>Compression Quality</label>
            <div className="flex gap-2 flex-wrap">
              {['low', 'medium', 'high'].map(q => (
                <button
                  key={q}
                  onClick={() => { setQuality(q); setResult(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ backgroundColor: quality === q ? qualityColors[q] : 'var(--bg-card)', color: quality === q ? '#fff' : 'var(--text-main)', border: '1px solid var(--border-color)' }}
                >{qualityLabels[q]}</button>
              ))}
            </div>
          </div>

          {processing && <Processing text="Compressing PDF..." />}

          {result && (
            <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="grid grid-cols-3 gap-4 text-center mb-3">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Original</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{formatBytes(result.originalSize)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Compressed</p>
                  <p className="text-sm font-semibold" style={{ color: '#059669' }}>{formatBytes(result.compressedSize)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Saved</p>
                  <p className="text-sm font-semibold" style={{ color: result.compressedSize < result.originalSize ? '#059669' : '#D29922' }}>
                    {result.compressedSize < result.originalSize
                      ? `${Math.round((1 - result.compressedSize / result.originalSize) * 100)}%`
                      : 'No reduction'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => downloadBlob(result.blob, file.name.replace('.pdf', '-compressed.pdf'))}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium mx-auto"
                style={{ backgroundColor: '#059669' }}
              >
                <Download size={14} /> Download Compressed PDF
              </button>
            </div>
          )}

          {!processing && !result && (
            <ActionButton onClick={compress} color="#059669">
              <div className="flex items-center gap-2"><Minimize2 size={16} /> Compress PDF</div>
            </ActionButton>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Tool 4: Add Watermark
// ═══════════════════════════════════════════
function WatermarkPDF() {
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [preview, setPreview] = useState(null)
  const [text, setText] = useState('DRAFT')
  const [fontSize, setFontSize] = useState(48)
  const [color, setColor] = useState('#FF0000')
  const [opacity, setOpacity] = useState(0.3)
  const [position, setPosition] = useState('diagonal')
  const [allPages, setAllPages] = useState(true)
  const [processing, setProcessing] = useState(false)
  const previewCanvasRef = useRef(null)

  async function handleFile(files) {
    const f = files[0]
    if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files'); return }
    const buf = await f.arrayBuffer()
    setFile(f)
    setBuffer(buf)
    // Render first page preview
    try {
      const thumb = await renderPageThumbnail(buf, 1, 400)
      setPreview(thumb)
    } catch {
      setPreview(null)
    }
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  async function apply() {
    if (!buffer) return
    setProcessing(true)
    try {
      const doc = await loadPdfDoc(buffer)
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const { r, g, b } = hexToRgb(color)
      const pages = doc.getPages()

      for (let i = 0; i < pages.length; i++) {
        if (!allPages && i > 0) break
        const page = pages[i]
        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(text, fontSize)

        let x, y, rotate
        if (position === 'diagonal') {
          x = (width - textWidth * 0.7) / 2
          y = height / 2 - fontSize / 2
          rotate = degrees(45)
        } else if (position === 'top') {
          x = (width - textWidth) / 2
          y = height - fontSize - 30
          rotate = degrees(0)
        } else {
          x = (width - textWidth) / 2
          y = 30
          rotate = degrees(0)
        }

        page.drawText(text, {
          x, y, size: fontSize, font,
          color: rgb(r, g, b),
          opacity: opacity,
          rotate,
        })
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), file.name.replace('.pdf', '-watermarked.pdf'))
      toast.success('Watermark applied')
    } catch (err) {
      toast.error(err.message || 'Watermark failed')
    }
    setProcessing(false)
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <DropZone accept=".pdf" onFiles={handleFile} label="Drag & drop a PDF to watermark" />
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <FileText size={16} style={{ color: '#D29922' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(file.size)}</p>
            </div>
            <button onClick={() => { setFile(null); setBuffer(null); setPreview(null) }} className="p-1 rounded hover:bg-red-50"><X size={14} style={{ color: '#EF4444' }} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Options */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Watermark Text</label>
                <input
                  type="text" value={text} onChange={e => setText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Font Size ({fontSize})</label>
                  <input type="range" min={24} max={72} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Opacity ({Math.round(opacity * 100)}%)</label>
                  <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(e.target.value / 100)} className="w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Colour</label>
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Position</label>
                  <select
                    value={position} onChange={e => setPosition(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                  >
                    <option value="diagonal">Diagonal Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-main)' }}>
                <input type="checkbox" checked={allPages} onChange={e => setAllPages(e.target.checked)} className="rounded" />
                Apply to all pages
              </label>
            </div>

            {/* Preview */}
            {preview && (
              <div className="relative rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)', backgroundColor: '#f8fafc' }}>
                <img src={preview} alt="Preview" className="w-full h-auto" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span
                    style={{
                      fontSize: `${fontSize * 0.4}px`,
                      fontWeight: 'bold',
                      color: color,
                      opacity: opacity,
                      transform: position === 'diagonal' ? 'rotate(-45deg)' : 'none',
                      position: position === 'top' ? 'absolute' : position === 'bottom' ? 'absolute' : 'relative',
                      top: position === 'top' ? '10%' : undefined,
                      bottom: position === 'bottom' ? '10%' : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >{text}</span>
                </div>
              </div>
            )}
          </div>

          {processing && <Processing text="Applying watermark..." />}
          {!processing && (
            <ActionButton onClick={apply} color="#D29922">
              <div className="flex items-center gap-2"><Droplets size={16} /> Apply Watermark</div>
            </ActionButton>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Tool 5: Add Page Numbers
// ═══════════════════════════════════════════
function PageNumbersPDF() {
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [position, setPosition] = useState('bottom-center')
  const [startNum, setStartNum] = useState(1)
  const [format, setFormat] = useState('Page X')
  const [fontSize, setFontSize] = useState(10)
  const [processing, setProcessing] = useState(false)

  async function handleFile(files) {
    const f = files[0]
    if (!f.type.includes('pdf') && !f.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files'); return }
    const buf = await f.arrayBuffer()
    setFile(f)
    setBuffer(buf)
    const count = await getPdfPageCount(buf)
    setPageCount(count || 0)
  }

  async function apply() {
    if (!buffer) return
    setProcessing(true)
    try {
      const doc = await loadPdfDoc(buffer)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      const total = pages.length

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const { width, height } = page.getSize()
        const num = startNum + i

        let label
        if (format === 'Page X') label = `Page ${num}`
        else if (format === 'X') label = `${num}`
        else label = `${num} of ${total + startNum - 1}`

        const textWidth = font.widthOfTextAtSize(label, fontSize)
        let x, y

        if (position === 'bottom-center') { x = (width - textWidth) / 2; y = 20 }
        else if (position === 'bottom-right') { x = width - textWidth - 30; y = 20 }
        else if (position === 'bottom-left') { x = 30; y = 20 }
        else if (position === 'top-center') { x = (width - textWidth) / 2; y = height - 20 - fontSize }
        else if (position === 'top-right') { x = width - textWidth - 30; y = height - 20 - fontSize }
        else { x = (width - textWidth) / 2; y = 20 }

        page.drawText(label, {
          x, y, size: fontSize, font,
          color: rgb(0.3, 0.3, 0.3),
        })
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), file.name.replace('.pdf', '-numbered.pdf'))
      toast.success('Page numbers added')
    } catch (err) {
      toast.error(err.message || 'Failed to add page numbers')
    }
    setProcessing(false)
  }

  const positions = [
    { value: 'bottom-center', label: 'Bottom Center' },
    { value: 'bottom-right', label: 'Bottom Right' },
    { value: 'bottom-left', label: 'Bottom Left' },
    { value: 'top-center', label: 'Top Center' },
    { value: 'top-right', label: 'Top Right' },
  ]

  return (
    <div className="space-y-4">
      {!file ? (
        <DropZone accept=".pdf" onFiles={handleFile} label="Drag & drop a PDF to number" />
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <FileText size={16} style={{ color: '#0891B2' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(file.size)} &middot; {pageCount} pages</p>
            </div>
            <button onClick={() => { setFile(null); setBuffer(null); setPageCount(0) }} className="p-1 rounded hover:bg-red-50"><X size={14} style={{ color: '#EF4444' }} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Position</label>
              <select
                value={position} onChange={e => setPosition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                {positions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Format</label>
              <select
                value={format} onChange={e => setFormat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                <option value="Page X">Page X</option>
                <option value="X">X</option>
                <option value="X of Y">X of Y</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Starting Number</label>
              <input
                type="number" min={1} value={startNum} onChange={e => setStartNum(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Font Size ({fontSize})</label>
              <input type="range" min={8} max={14} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full mt-2" />
            </div>
          </div>

          {processing && <Processing text="Adding page numbers..." />}
          {!processing && (
            <ActionButton onClick={apply} color="#0891B2">
              <div className="flex items-center gap-2"><Hash size={16} /> Add Page Numbers</div>
            </ActionButton>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Tool 6: Images to PDF
// ═══════════════════════════════════════════
function ImagesToPDF() {
  const [images, setImages] = useState([])
  const [pageSize, setPageSize] = useState('A4')
  const [orientation, setOrientation] = useState('auto')
  const [fitMode, setFitMode] = useState('fit')
  const [margin, setMargin] = useState(20)
  const [processing, setProcessing] = useState(false)
  const sortable = useSortableList(images)

  const PAGE_SIZES = {
    A4: { width: 595.28, height: 841.89 },
    A3: { width: 841.89, height: 1190.55 },
    Letter: { width: 612, height: 792 },
  }

  async function addImages(files) {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
    const imageFiles = files.filter(f => validTypes.includes(f.type) || /\.(jpe?g|png)$/i.test(f.name))
    if (imageFiles.length !== files.length) toast.error('Only JPG and PNG images are accepted')

    const entries = []
    for (const f of imageFiles) {
      const url = URL.createObjectURL(f)
      entries.push({ name: f.name, size: f.size, file: f, previewUrl: url, id: Date.now() + Math.random() })
    }
    const merged = [...sortable.items, ...entries]
    setImages(merged)
    sortable.setItems(merged)
  }

  function removeImage(idx) {
    const item = sortable.items[idx]
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    sortable.setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function create() {
    if (sortable.items.length === 0) { toast.error('Add at least one image'); return }
    setProcessing(true)
    try {
      const doc = await PDFDocument.create()
      const sz = PAGE_SIZES[pageSize]

      for (const img of sortable.items) {
        const bytes = await img.file.arrayBuffer()
        let embedded
        if (img.file.type === 'image/png' || img.name.toLowerCase().endsWith('.png')) {
          embedded = await doc.embedPng(bytes)
        } else {
          embedded = await doc.embedJpg(bytes)
        }

        const imgW = embedded.width
        const imgH = embedded.height
        let pw, ph

        if (orientation === 'portrait') { pw = sz.width; ph = sz.height }
        else if (orientation === 'landscape') { pw = sz.height; ph = sz.width }
        else {
          // auto: match image orientation
          if (imgW > imgH) { pw = sz.height; ph = sz.width }
          else { pw = sz.width; ph = sz.height }
        }

        const page = doc.addPage([pw, ph])
        const availW = pw - margin * 2
        const availH = ph - margin * 2

        let drawW, drawH, drawX, drawY

        if (fitMode === 'stretch') {
          drawW = availW
          drawH = availH
          drawX = margin
          drawY = margin
        } else if (fitMode === 'actual') {
          drawW = Math.min(imgW, availW)
          drawH = Math.min(imgH, availH)
          drawX = margin + (availW - drawW) / 2
          drawY = margin + (availH - drawH) / 2
        } else {
          // fit to page (maintain aspect ratio)
          const scaleW = availW / imgW
          const scaleH = availH / imgH
          const scale = Math.min(scaleW, scaleH)
          drawW = imgW * scale
          drawH = imgH * scale
          drawX = margin + (availW - drawW) / 2
          drawY = margin + (availH - drawH) / 2
        }

        page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH })
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf')
      toast.success(`PDF created with ${sortable.items.length} pages`)
    } catch (err) {
      toast.error(err.message || 'Failed to create PDF')
    }
    setProcessing(false)
  }

  return (
    <div className="space-y-4">
      <DropZone accept=".jpg,.jpeg,.png" multiple onFiles={addImages} label="Drag & drop images here (JPG, PNG)" />

      {sortable.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sortable.items.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => sortable.onDragStart(i)}
              onDragOver={e => sortable.onDragOver(e, i)}
              onDragEnd={sortable.onDragEnd}
              className="relative rounded-lg overflow-hidden group cursor-grab"
              style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', aspectRatio: '3/4' }}
            >
              <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/60">
                <p className="text-[10px] text-white truncate">{img.name}</p>
              </div>
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">{i + 1}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {sortable.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Page Size</label>
            <select
              value={pageSize} onChange={e => setPageSize(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Orientation</label>
            <select
              value={orientation} onChange={e => setOrientation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            >
              <option value="auto">Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Fit Mode</label>
            <select
              value={fitMode} onChange={e => setFitMode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            >
              <option value="fit">Fit to Page</option>
              <option value="stretch">Stretch</option>
              <option value="actual">Actual Size</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-main)' }}>Margin ({margin}pt)</label>
            <input type="range" min={0} max={60} value={margin} onChange={e => setMargin(Number(e.target.value))} className="w-full mt-2" />
          </div>
        </div>
      )}

      {processing && <Processing text="Creating PDF..." />}
      {sortable.items.length > 0 && !processing && (
        <ActionButton onClick={create} color="#EA580C">
          <div className="flex items-center gap-2"><ImageIcon size={16} /> Create PDF ({sortable.items.length} images)</div>
        </ActionButton>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════
export default function PDFTools() {
  const [activeTool, setActiveTool] = useState(null)

  const toolComponents = {
    merge: MergePDF,
    split: SplitPDF,
    compress: CompressPDF,
    watermark: WatermarkPDF,
    pagenumbers: PageNumbersPDF,
    imagestopdf: ImagesToPDF,
  }

  const ActiveComponent = activeTool ? toolComponents[activeTool] : null
  const activeToolData = TOOLS.find(t => t.id === activeTool)

  return (
    <div className="max-w-5xl mx-auto">
      {!activeTool ? (
        <>
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-main)' }}>PDF Tools</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Free tools to merge, split, compress, and edit PDFs</p>
          </div>

          {/* Tool Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className="text-left rounded-xl p-5 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all group-hover:scale-110"
                  style={{ backgroundColor: tool.color + '18' }}
                >
                  <tool.Icon size={20} style={{ color: tool.color }} />
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-main)' }}>{tool.title}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tool.desc}</p>
                <div className="mt-3 h-1 rounded-full" style={{ backgroundColor: tool.color + '30' }}>
                  <div className="h-full w-0 group-hover:w-full rounded-full transition-all duration-300" style={{ backgroundColor: tool.color }} />
                </div>
              </button>
            ))}
          </div>

          {/* Info */}
          <div className="mt-8 rounded-lg p-4 text-center" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              All processing happens in your browser. Files are never uploaded to any server.
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Tool header */}
          <div className="mb-5">
            <button
              onClick={() => setActiveTool(null)}
              className="flex items-center gap-1.5 text-sm mb-3 transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} /> Back to all tools
            </button>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: activeToolData.color + '18' }}
              >
                <activeToolData.Icon size={20} style={{ color: activeToolData.color }} />
              </div>
              <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{activeToolData.title}</h1>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{activeToolData.desc}</p>
              </div>
            </div>
          </div>

          {/* Tool component */}
          <div className="rounded-xl p-4 sm:p-6" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <ActiveComponent />
          </div>

          {/* Privacy note */}
          <div className="mt-4 text-center">
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              All processing happens locally in your browser. Files are never uploaded.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
