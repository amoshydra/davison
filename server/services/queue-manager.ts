import { EventEmitter } from 'node:events'
import { MusicTrack, getTrackById, getMusicLibrary } from './music-discovery.js'
import { sonosController } from './sonos-controller.js'
import { config } from '../config.js'

export type LoopMode = 'none' | 'one' | 'all'

const VALID_LOOP_MODES: ReadonlySet<string> = new Set(['none', 'one', 'all'])

function folderPath(relativePath: string): string | null {
  const idx = relativePath.lastIndexOf('/')
  return idx >= 0 ? relativePath.slice(0, idx) : null
}

interface QueueState {
  queue: MusicTrack[]
  history: MusicTrack[]
  currentIndex: number | null
  loopMode: LoopMode
  autoPlay: boolean
}

class QueueManager extends EventEmitter {
  private state: QueueState = {
    queue: [],
    history: [],
    currentIndex: null,
    loopMode: 'all',
    autoPlay: true,
  }

  private mutationQueue: Promise<void> = Promise.resolve()

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.mutationQueue = this.mutationQueue.then(() => fn().then(resolve, reject))
    })
  }

  getState() {
    return { ...this.state, currentTrack: this.getCurrentTrack(), nextTrack: this.getNextTrack() }
  }

  getQueue(): MusicTrack[] {
    return [...this.state.queue]
  }

  getCurrentTrack(): MusicTrack | null {
    if (this.state.currentIndex === null) return null
    return this.state.queue[this.state.currentIndex] ?? null
  }

  getNextTrack(): MusicTrack | null {
    if (this.state.currentIndex === null) return null
    const next = this.getNextIndex()
    return next !== null ? this.state.queue[next] : null
  }

  private getNextIndex(): number | null {
    const { queue, currentIndex, loopMode } = this.state
    if (queue.length === 0) return null
    if (currentIndex === null) return 0

    if (loopMode === 'one') return currentIndex
    const next = currentIndex + 1
    if (next >= queue.length) {
      return loopMode === 'all' ? 0 : null
    }
    return next
  }

  private getPreviousIndex(): number | null {
    const { queue, history } = this.state
    if (history.length > 0) {
      const track = history[history.length - 1]
      this.state.history = history.slice(0, -1)
      const idx = queue.findIndex(t => t.id === track.id)
      return idx >= 0 ? idx : this.state.currentIndex
    }
    if (queue.length === 0) return null
    if (this.state.currentIndex === null) return 0
    const prev = this.state.currentIndex - 1
    return prev >= 0 ? prev : (this.state.loopMode === 'all' ? queue.length - 1 : 0)
  }

  private async playTrack(index: number): Promise<void> {
    const track = this.state.queue[index]
    if (!track) return

    this.state.currentIndex = index
    this.emit('track-change', track)

    try {
      const encodedPath = track.relativePath.split('/').map(s => encodeURIComponent(s)).join('/')
      const streamUrl = `http://${config.host}:${config.port}/music-files/${track.baseIdx}/${encodedPath}`
      await sonosController.playUri(streamUrl, track.title)
    } catch (err) {
      console.error('Failed to play track:', track.id, track.title, err)
    }
  }

  async play(): Promise<void> {
    await this.serialized(async () => {
      if (this.state.currentIndex === null && this.state.queue.length > 0) {
        await this.playTrack(0)
      } else {
        await sonosController.play()
      }
    })
  }

  async pause(): Promise<void> {
    await sonosController.pause()
  }

  async stop(): Promise<void> {
    await this.serialized(async () => {
      await sonosController.stop()
      this.state.currentIndex = null
      this.emit('state-change', this.getState())
    })
  }

  async next(): Promise<void> {
    await this.serialized(async () => {
      const nextIdx = this.getNextIndex()
      if (nextIdx === null) return

      const current = this.getCurrentTrack()
      if (current) {
        this.state.history = [...this.state.history, current]
      }
      await this.playTrack(nextIdx)
    })
  }

  async previous(): Promise<void> {
    await this.serialized(async () => {
      const prevIdx = this.getPreviousIndex()
      if (prevIdx === null) return

      const current = this.getCurrentTrack()
      if (current && this.state.history[this.state.history.length - 1]?.id !== current.id) {
        this.state.history = [...this.state.history, current]
      }
      await this.playTrack(prevIdx)
    })
  }

  private resolveTracks(trackIds: string[]): MusicTrack[] {
    const seen = new Set<string>()
    const result: MusicTrack[] = []
    for (const id of trackIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const track = getTrackById(id)
      if (track) result.push(track)
    }
    return result
  }

  async addToQueue(trackIds: string[]): Promise<void> {
    await this.serialized(async () => {
      const tracks = this.resolveTracks(trackIds)
      if (tracks.length === 0) return

      // Deduplicate against existing queue
      const existingIds = new Set(this.state.queue.map(t => t.id))
      const newTracks = tracks.filter(t => !existingIds.has(t.id))
      if (newTracks.length === 0) return

      this.state.queue = [...this.state.queue, ...newTracks]
      this.emit('queue-change', this.getQueue())

      if (this.state.currentIndex === null && this.state.autoPlay) {
        await this.playTrack(0)
      }
    })
  }

  async playNow(trackIds: string[]): Promise<void> {
    await this.serialized(async () => {
      const tracks = this.resolveTracks(trackIds)
      if (tracks.length === 0) return

      this.state.queue = tracks
      this.state.history = []
      this.state.currentIndex = null
      this.emit('queue-change', this.getQueue())
      await this.playTrack(0)
    })
  }

  async playNext(trackIds: string[]): Promise<void> {
    await this.serialized(async () => {
      const tracks = this.resolveTracks(trackIds)
      if (tracks.length === 0) return

      // Deduplicate against existing queue
      const existingIds = new Set(this.state.queue.map(t => t.id))
      const newTracks = tracks.filter(t => !existingIds.has(t.id))
      if (newTracks.length === 0) return

      const insertAt = this.state.currentIndex !== null ? this.state.currentIndex + 1 : this.state.queue.length
      this.state.queue.splice(insertAt, 0, ...newTracks)
      this.emit('queue-change', this.getQueue())
    })
  }

  async playFolderOrNow(trackId: string): Promise<void> {
    await this.serialized(async () => {
      const track = getTrackById(trackId)
      if (!track) return
      const existingIds = new Set(this.state.queue.map(t => t.id))
      if (existingIds.has(track.id)) return

      const folder = folderPath(track.relativePath)

      // Folder-fill: queue empty + track has a directory
      if (this.state.queue.length === 0 && folder) {
        const allTracks = getMusicLibrary()
        const folderTracks = allTracks
          .filter(t => t.baseIdx === track.baseIdx && folderPath(t.relativePath) === folder)
          .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

        const startIdx = folderTracks.findIndex(t => t.id === trackId)
        this.state.queue = [...folderTracks.slice(startIdx), ...folderTracks.slice(0, startIdx)]
        this.state.history = []
        this.state.currentIndex = null
        this.emit('queue-change', this.getQueue())
        await this.playTrack(0)
        return
      }

      // Insert next + play
      const insertAt = this.state.currentIndex !== null
        ? this.state.currentIndex + 1
        : this.state.queue.length
      this.state.queue.splice(insertAt, 0, track)
      this.emit('queue-change', this.getQueue())
      await this.playTrack(insertAt)
    })
  }

  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return
    if (!Number.isInteger(index)) return

    this.state.queue = this.state.queue.filter((_, i) => i !== index)

    if (this.state.queue.length === 0) {
      this.state.currentIndex = null
      this.state.history = []
    } else if (this.state.currentIndex !== null) {
      if (index < this.state.currentIndex) {
        this.state.currentIndex--
      } else if (index === this.state.currentIndex) {
        this.state.currentIndex = Math.min(this.state.currentIndex, this.state.queue.length - 1)
      }
    }
    this.emit('queue-change', this.getQueue())
  }

  clearQueue(): void {
    this.state.queue = []
    this.state.history = []
    this.state.currentIndex = null
    this.emit('queue-change', this.getQueue())
  }

  reorderQueue(from: number, to: number): void {
    if (from < 0 || from >= this.state.queue.length) return
    if (to < 0 || to >= this.state.queue.length) return
    if (!Number.isInteger(from) || !Number.isInteger(to)) return

    const queue = [...this.state.queue]
    const [moved] = queue.splice(from, 1)
    queue.splice(to, 0, moved)
    this.state.queue = queue
    this.emit('queue-change', this.getQueue())
  }

  setLoopMode(mode: LoopMode): void {
    if (!VALID_LOOP_MODES.has(mode)) {
      console.warn('Invalid loop mode:', mode)
      return
    }
    this.state.loopMode = mode
    this.emit('loop-change', mode)
  }

  async setAutoPlay(auto: boolean): Promise<void> {
    this.state.autoPlay = auto
  }

  /** Re-send current track URI — used when device becomes available after queue was filled */
  async resumePlayback(): Promise<void> {
    await this.serialized(async () => {
      if (!sonosController.hasDevice()) return
      const track = this.getCurrentTrack()
      if (!track) return
      await this.playTrack(this.state.currentIndex!)
    })
  }

  async jumpTo(trackId: string): Promise<void> {
    await this.serialized(async () => {
      const idx = this.state.queue.findIndex(t => t.id === trackId)
      if (idx === -1) return
      await this.playTrack(idx)
    })
  }

  setQueue(tracks: MusicTrack[], startIndex = 0): void {
    this.state.queue = [...tracks]
    this.state.history = []
    this.state.currentIndex = null
    this.emit('queue-change', this.getQueue())
    if (tracks.length > 0) {
      this.playTrack(startIndex).catch(err => {
        console.error('Failed to start new queue:', err)
      })
    }
  }
}

export const queueManager = new QueueManager()

let pollTimer: ReturnType<typeof setInterval> | null = null
const POLL_INTERVAL = 2000
const AUTO_ADVANCE_THRESHOLD = 2

export function startAutoAdvancePolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    try {
      const status = await sonosController.getStatus()
      if (!status) return

      const current = queueManager.getCurrentTrack()
      if (!current || status.state === 'PLAYING') return

      if (status.state === 'STOPPED' && status.track.duration > 0) {
        const elapsed = status.track.position
        const remaining = status.track.duration - elapsed
        if (remaining < AUTO_ADVANCE_THRESHOLD) {
          const nextId = queueManager.getNextTrack()
          if (nextId) {
            await queueManager.next()
          }
        }
      }
    } catch (err) {
      console.warn('Auto-advance poll error:', err)
    }
  }, POLL_INTERVAL)
}

export function stopAutoAdvancePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
