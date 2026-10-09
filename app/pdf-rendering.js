// Source PDFs can contain a separate monochrome image mask for all printed text.
// Keep decoding/rasterization in pixel buffers instead of GPU-backed bitmaps,
// and render into a fresh canvas so cancelled work never replaces a good page.
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

export function loadPdfDocument(data) {
  return pdfjs.getDocument({
    data,
    isOffscreenCanvasSupported: false,
    enableHWA: false,
    cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('../node_modules/pdfjs-dist/wasm/', import.meta.url).href,
  });
}

export function createPdfRender(page, scale, pixelRatio = 1) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width * pixelRatio);
  canvas.height = Math.ceil(viewport.height * pixelRatio);
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const task = page.render({
    canvasContext: context, viewport,
    transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
  });
  return { canvas, task };
}
