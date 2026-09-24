// Convierte un archivo de imagen en un dataURL JPEG redimensionado.
// Redimensionar evita llenar IndexedDB con fotos enormes del móvil.

export function fileToDataURL(file: File, maxSize = 1000, quality = 0.82, mime: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width >= height) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No se pudo procesar la imagen'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL(mime, quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Archivo de imagen no válido'))
    }
    img.src = url
  })
}
