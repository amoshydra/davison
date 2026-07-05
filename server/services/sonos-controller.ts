import { Sonos } from 'sonos'
import { EventEmitter } from 'node:events'
import dgram from 'node:dgram'
import os from 'node:os'
import net from 'node:net'

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

function findLanAddress(): string {
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    if (name.startsWith('wg') || name.startsWith('tun') || name.startsWith('docker') || name.startsWith('br-')) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return '0.0.0.0'
}

function getSubnets(): string[] {
  const subnets: string[] = []
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    if (name.startsWith('wg') || name.startsWith('tun') || name.startsWith('docker') || name.startsWith('br-') || name === 'lo') continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.cidr) {
        subnets.push(addr.cidr)
      }
    }
  }
  return subnets
}

class SonosController extends EventEmitter {
  private devices: Map<string, Sonos> = new Map()
  private deviceInfo: Map<string, SonosDevice> = new Map()
  private selectedDevice: string | null = null
  private listening = false

  async discoverDevices(timeout = 5000): Promise<SonosDevice[]> {
    this.devices.clear()
    this.deviceInfo.clear()

    const lanAddr = findLanAddress()
    const foundIps = new Set<string>()

    // SSDP multicast discovery
    await new Promise<void>((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      socket.on('message', (msg, rinfo) => {
        if (msg.toString().includes('Sonos')) {
          foundIps.add(rinfo.address)
        }
      })

      socket.on('error', () => { /* ignore */ })

      try {
        socket.bind(0, lanAddr, () => {
          socket.setMulticastTTL(4)
          socket.setMulticastInterface(lanAddr)
          socket.setBroadcast(true)
          try { socket.addMembership('239.255.255.250', lanAddr) } catch { /* ignore */ }

          const search = Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
            '\r\n'
          )

          socket.send(search, 0, search.length, 1900, '239.255.255.250')
          socket.send(search, 0, search.length, 1900, '255.255.255.255')
        })
      } catch { /* socket bind failed, skip SSDP */ }

      setTimeout(() => {
        try { socket.close() } catch { /* ignore */ }
        resolve()
      }, timeout)
    })

    // Fallback: TCP port scan on 1400 for local subnets
    if (foundIps.size === 0) {
      const subnets = getSubnets()
      const scanPromises: Promise<void>[] = []

      for (const cidr of subnets) {
        const [base, prefixStr] = cidr.split('/')
        const prefix = parseInt(prefixStr, 10)
        if (prefix >= 24) {
          const parts = base.split('.')
          const networkPrefix = parts.slice(0, 3).join('.')
          for (let i = 1; i <= 254; i++) {
            const ip = `${networkPrefix}.${i}`
            scanPromises.push(
              new Promise((resolveScan) => {
                const s = new net.Socket()
                s.setTimeout(500)
                s.on('connect', () => {
                  foundIps.add(ip)
                  s.destroy()
                  resolveScan()
                })
                s.on('error', () => s.destroy())
                s.on('timeout', () => s.destroy())
                s.connect(1400, ip, () => {})
                setTimeout(() => resolveScan(), 600)
              })
            )
          }
        }
      }

      await Promise.all(scanPromises)
    }

    // Register all found devices
    for (const ip of foundIps) {
      try {
        const device = new Sonos(ip)
        await this.registerDevice(device)
      } catch {
        // skip unresponsive
      }
    }

    return this.getDevices()
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
