import { useEffect, useState, useRef, useMemo } from 'react'

const imgCache = new Map<string, string>()

function hashToRgb(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  hash = Math.abs(hash)

  const hue = hash % 360
  const sat = 55 + (hash % 25)
  const lig = 40 + (hash % 12)

  // HSL → RGB
  const s = sat / 100
  const l = lig / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0

  if (hue < 60) { r = c; g = x }
  else if (hue < 120) { r = x; g = c }
  else if (hue < 180) { g = c; b = x }
  else if (hue < 240) { g = x; b = c }
  else if (hue < 300) { r = x; b = c }
  else { r = c; b = x }

  return `${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)}`
}

export function useAlbumColor(imageUrl: string | null, fallbackKey?: string): string {
  const [sampled, setSampled] = useState<string | null>(null)
  const urlRef = useRef(imageUrl)

  const fallback = useMemo(() => {
    if (!fallbackKey) return '6,182,212'
    return hashToRgb(fallbackKey)
  }, [fallbackKey])

  useEffect(() => {
    if (!imageUrl) {
      setSampled(null)
      urlRef.current = null
      return
    }

    if (urlRef.current !== imageUrl) {
      setSampled(null)
      urlRef.current = imageUrl
    }

    if (imgCache.has(imageUrl)) {
      setSampled(imgCache.get(imageUrl)!)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const rgb = `${r},${g},${b}`
      imgCache.set(imageUrl, rgb)
      setSampled(rgb)
    }

    img.onerror = () => setSampled(null)
    img.src = imageUrl
  }, [imageUrl])

  return sampled ?? fallback
}
