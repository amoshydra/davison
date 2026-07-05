import { EventEmitter } from 'node:events'
import { MusicTrack, getTrackById } from './music-discovery.js'
import { sonosController } from './sonos-controller.js'
import { config } from '../config.js'

export type LoopMode = 'none' | 'one' | 'all'

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
      const track = history.pop()!
      this.state.history = [...history]
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
      const streamUrl = `http://${config.host}:${config.port}/music-files/${encodedPath}`
      await sonosController.playUri(streamUrl, track.title)
    } catch (err) {
      console.error('Failed to play track:', err)
    }
  }

  async play(): Promise<void> {
    if (this.state.currentIndex === null && this.state.queue.length > 0) {
      await this.playTrack(0)
    } else {
      await sonosController.play()
    }
  }

  async pause(): Promise<void> {
    await sonosController.pause()
  }

  async stop(): Promise<void> {
    await sonosController.stop()
    this.state.currentIndex = null
    this.emit('state-change', this.getState())
  }

  async next(): Promise<void> {
    const nextIdx = this.getNextIndex()
    if (nextIdx === null) return

    const current = this.getCurrentTrack()
    if (current) {
      this.state.history = [...this.state.history, current]
    }
    await this.playTrack(nextIdx)
  }

  async previous(): Promise<void> {
    const prevIdx = this.getPreviousIndex()
    if (prevIdx === null) return

    const current = this.getCurrentTrack()
    if (current && this.state.history[this.state.history.length - 1]?.id !== current.id) {
      this.state.history = [...this.state.history, current]
    }
    await this.playTrack(prevIdx)
  }

  async addToQueue(trackIds: string[]): Promise<void> {
    const tracks = trackIds.map(id => getTrackById(id)).filter((t): t is MusicTrack => !!t)
    this.state.queue = [...this.state.queue, ...tracks]
    this.emit('queue-change', this.getQueue())

    if (this.state.queue.length > 0 && this.state.currentIndex === null && this.state.autoPlay) {
      await this.playTrack(0)
    }
  }

  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return

    this.state.queue = this.state.queue.filter((_, i) => i !== index)
    if (this.state.currentIndex !== null) {
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
    const queue = [...this.state.queue]
    const [moved] = queue.splice(from, 1)
    queue.splice(to, 0, moved)
    this.state.queue = queue
    this.emit('queue-change', this.getQueue())
  }

  setLoopMode(mode: LoopMode): void {
    this.state.loopMode = mode
    this.emit('loop-change', mode)
  }

  setAutoPlay(auto: boolean): void {
    this.state.autoPlay = auto
  }

  async jumpTo(trackId: string): Promise<void> {
    const idx = this.state.queue.findIndex(t => t.id === trackId)
    if (idx === -1) return
    await this.playTrack(idx)
  }

  setQueue(tracks: MusicTrack[], startIndex = 0): void {
    this.state.queue = [...tracks]
    this.state.history = []
    this.state.currentIndex = null
    this.emit('queue-change', this.getQueue())
    if (tracks.length > 0) {
      void this.playTrack(startIndex)
    }
  }
}

export const queueManager = new QueueManager()
