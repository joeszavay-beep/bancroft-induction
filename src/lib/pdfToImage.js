import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function pdfToImage(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    console.log('PDF size:', arrayBuffer.byteLength, 'bytes')

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    console.log('PDF loaded, pages:', pdf.numPages)

    const page = await pdf.getPage(1)
    console.log('Page 1 loaded')

    // Render at 2x for high res
    const scale = 2
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    console.log('Canvas size:', canvas.width, 'x', canvas.height)

    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    console.log('Page rendered to canvas')

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('PNG blob created:', blob.size, 'bytes')
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      }, 'image/png')
    })
  } catch (err) {
    console.error('pdfToImage error:', err)
    throw err
  }
}
