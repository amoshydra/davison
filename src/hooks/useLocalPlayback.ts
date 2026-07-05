import { useState, useRef, useCallback, useEffect } from 'react'
import type { MusicTrack } from '../types'

export function useLocalPlayback() {
  const [queue, setQueue] = useState<MusicTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<MusicTrack[]>(queue)
  const indexRef = useRef<number | null>(currentIndex)
  const playAtRef = useRef<(idx: number) => void>(() => {})

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { indexRef.current = currentIndex }, [currentIndex])

  const currentTrack = currentIndex !== null ? queue[currentIndex] ?? null : null

  // Stable playAt that reads from refs
  const playAt = useCallback((idx: number) => {
    const q = queueRef.current
    const track = q[idx]
    if (!track) return
    if (!audioRef.current) {
      audioRef.current = new Audio()
      setReady(true)
    }
    const audio = audioRef.current
    audio.src = `/api/music/stream/${track.id}`
    setCurrentIndex(idx)
    setPosition(0)
    setDuration(track.duration || 0)
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [])

  playAtRef.current = playAt

  // Attach event listeners once audio element is created
  useEffect(() => {
    if (!ready) return
    const audio = audioRef.current!
    const ended = () => {
      const idx = indexRef.current
      const q = queueRef.current
      if (idx !== null && idx < q.length - 1) {
        playAtRef.current(idx + 1)
      } else {
        setPlaying(false)
        setPosition(0)
      }
    }
    const timeupdate = () => {
      if (audio) setPosition(audio.currentTime)
    }
    const loadedmeta = () => {
      if (audio) setDuration(audio.duration)
    }
    const err = () => setPlaying(false)
    audio.addEventListener('ended', ended)
    audio.addEventListener('timeupdate', timeupdate)
    audio.addEventListener('loadedmetadata', loadedmeta)
    audio.addEventListener('error', err)
    audio.volume = 0.5
    return () => {
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('timeupdate', timeupdate)
      audio.removeEventListener('loadedmetadata', loadedmeta)
      audio.removeEventListener('error', err)
    }
  }, [ready])

  useEffect(() => {
    return () => { audioRef.current?.pause() }
  }, [])

  const playNow = useCallback((tracks: MusicTrack[]) => {
    queueRef.current = tracks
    indexRef.current = 0
    setQueue(tracks)
    setCurrentIndex(0)
    playAt(0)
  }, [playAt])

  const playTrack = useCallback((track: MusicTrack) => {
    playNow([track])
  }, [playNow])

  const addToQueue = useCallback((tracks: MusicTrack[]) => {
    setQueue(prev => {
      const next = [...prev, ...tracks]
      queueRef.current = next
      return next
    })
  }, [])

  const playNext = useCallback((tracks: MusicTrack[]) => {
    setQueue(prev => {
      const idx = indexRef.current ?? -1
      const next = [...prev.slice(0, idx + 1), ...tracks, ...prev.slice(idx + 1)]
      queueRef.current = next
      return next
    })
  }, [])

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      audio.pause()
      setPlaying(false)
    }
  }, [])

  const seekTo = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      setPosition(seconds)
    }
  }, [])

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current) audioRef.current.volume = vol / 100
  }, [])

  const nextTrack = useCallback(() => {
    const idx = indexRef.current
    const q = queueRef.current
    if (idx === null || idx >= q.length - 1) {
      setPlaying(false)
      setPosition(0)
      return
    }
    playAtRef.current(idx + 1)
  }, [])

  const previousTrack = useCallback(() => {
    const idx = indexRef.current
    if (idx === null || idx <= 0) {
      setPlaying(false)
      setPosition(0)
      return
    }
    playAtRef.current(idx - 1)
  }, [])

  const clearQueue = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setQueue([])
    queueRef.current = []
    setCurrentIndex(null)
    indexRef.current = null
    setPlaying(false)
    setPosition(0)
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    const idx = indexRef.current
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index)
      queueRef.current = next
      return next
    })
    if (idx === index) {
      const q = queueRef.current
      if (idx < q.length) {
        playAtRef.current(idx)
      } else {
        setPlaying(false)
        setPosition(0)
      }
    } else if (idx !== null && index < idx) {
      indexRef.current = idx - 1
      setCurrentIndex(idx - 1)
    }
  }, [])

  return {
    queue,
    currentIndex,
    currentTrack,
    playing,
    position,
    duration,
    playTrack,
    playNow,
    playNext,
    addToQueue,
    togglePlayPause,
    seekTo,
    setVolume,
    next: nextTrack,
    previous: previousTrack,
    clearQueue,
    removeFromQueue,
  }
}
