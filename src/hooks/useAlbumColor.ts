import { useEffect, useState, useRef } from 'react'

const cache = new Map<string, string>()

export function useAlbumColor(imageUrl: string | null): string | null {
  const [color, setColor] = useState<string | null>(null)
  const urlRef = useRef(imageUrl)

  useEffect(() => {
    if (!imageUrl) {
      setColor(null)
      urlRef.current = null
      return
    }

    if (urlRef.current !== imageUrl) {
      setColor(null)
      urlRef.current = imageUrl
    }

    if (cache.has(imageUrl)) {
      setColor(cache.get(imageUrl)!)
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
      cache.set(imageUrl, rgb)
      setColor(rgb)
    }

    img.onerror = () => setColor(null)
    img.src = imageUrl
  }, [imageUrl])

  return color
}
