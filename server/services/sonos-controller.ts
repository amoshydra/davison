import { DeviceDiscovery, Sonos } from 'sonos'
import { EventEmitter } from 'node:events'

export interface SonosDevice {
  id: string
  name: string
  ip: string
  model: string
  group: string
}

export interface SonosStatus {
  state: 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED'
  track: {
    title: string
    artist: string
    album: string
    albumArt: string
    duration: number
    position: number
  }
  volume: number
  muted: boolean
}

class SonosController extends EventEmitter {
  private devices: Map<string, Sonos> = new Map()
  private deviceInfo: Map<string, SonosDevice> = new Map()
  private selectedDevice: string | null = null
  private listening = false

  async discoverDevices(): Promise<SonosDevice[]> {
    this.devices.clear()
    this.deviceInfo.clear()

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(this.getDevices()), 5000)
      const discovery = DeviceDiscovery((device: Sonos) => {
        void this.registerDevice(device)
        clearTimeout(timeout)
      })
      discovery.on('DeviceAvailable', (device: Sonos) => {
        void this.registerDevice(device)
      })
      setTimeout(() => {
        discovery.destroy()
        resolve(this.getDevices())
      }, 6000)
    })
  }

  private async registerDevice(device: Sonos): Promise<void> {
    try {
      const desc = await device.deviceDescription()
      const id = desc.UUID || device.host
      const name = desc.roomName || desc.displayName || device.host
      const group = (await device.getAllGroups())[0]?.Name || name

      this.devices.set(id, device)
      this.deviceInfo.set(id, {
        id,
        name,
        ip: device.host,
        model: desc.modelName || '',
        group,
      })
      this.emit('device-found', this.deviceInfo.get(id))
    } catch {
      // skip unresponsive devices
    }
  }

  getDevices(): SonosDevice[] {
    return Array.from(this.deviceInfo.values())
  }

  selectDevice(id: string): boolean {
    if (!this.devices.has(id)) return false
    this.selectedDevice = id
    return true
  }

  private getDevice(): Sonos | undefined {
    if (!this.selectedDevice) return undefined
    return this.devices.get(this.selectedDevice)
  }

  async getStatus(): Promise<SonosStatus | null> {
    const device = this.getDevice()
    if (!device) return null

    try {
      const [trackInfo, transportInfo, volume, muted] = await Promise.all([
        device.currentTrack(),
        device.getCurrentState(),
        device.getVolume(),
        device.getMuted(),
      ])

      return {
        state: transportInfo as SonosStatus['state'],
        track: {
          title: trackInfo?.title || 'Unknown',
          artist: trackInfo?.artist || 'Unknown',
          album: trackInfo?.album || 'Unknown',
          albumArt: trackInfo?.albumArtURI || '',
          duration: trackInfo?.duration || 0,
          position: trackInfo?.position || 0,
        },
        volume,
        muted,
      }
    } catch {
      return null
    }
  }

  async play(): Promise<void> {
    await this.getDevice()?.play()
  }

  async pause(): Promise<void> {
    await this.getDevice()?.pause()
  }

  async stop(): Promise<void> {
    await this.getDevice()?.stop()
  }

  async next(): Promise<void> {
    await this.getDevice()?.next()
  }

  async previous(): Promise<void> {
    await this.getDevice()?.previous()
  }

  async setVolume(volume: number): Promise<void> {
    await this.getDevice()?.setVolume(volume)
  }

  async getVolume(): Promise<number> {
    return (await this.getDevice()?.getVolume()) ?? 0
  }

  async playUri(uri: string): Promise<void> {
    await this.getDevice()?.play(uri)
  }

  async queueUri(uri: string): Promise<void> {
    await this.getDevice()?.queue(uri)
  }

  async flushQueue(): Promise<void> {
    await this.getDevice()?.flush()
  }

  async startListening(): Promise<void> {
    const device = this.getDevice()
    if (!device || this.listening) return

    try {
      await device.startListening()
      this.listening = true

      device.on('PlayState', (state: string) => {
        this.emit('play-state', state)
      })

      device.on('CurrentTrack', (track: Record<string, unknown>) => {
        this.emit('current-track', track)
      })

      device.on('AVTransport', (event: Record<string, unknown>) => {
        this.emit('av-transport', event)
      })

      device.on('Volume', (volume: number) => {
        this.emit('volume-change', volume)
      })
    } catch (err) {
      console.warn('Failed to start UPnP event listening:', err)
    }
  }

  async stopListening(): Promise<void> {
    const device = this.getDevice()
    if (!device || !this.listening) return

    try {
      await device.stopListening()
      this.listening = false
      device.removeAllListeners()
    } catch {
      // ignore
    }
  }
}

export const sonosController = new SonosController()
