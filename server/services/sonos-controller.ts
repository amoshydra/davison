import { Sonos } from 'sonos'
import { EventEmitter } from 'node:events'
import dgram from 'node:dgram'
import os from 'node:os'
import net from 'node:net'
import { getMusicLibrary } from './music-discovery.js'

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
    trackId?: string
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

const SSDP_MULTICAST_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const SONOS_UPNP_PORT = 1400
const SSDP_TIMEOUT = 5000
const TCP_SCAN_PORT = 1400
const TCP_SCAN_TIMEOUT = 500
const TCP_SCAN_RESOLVE_DELAY = 600
const MULTICAST_TTL = 4

const IGNORED_IFACES = ['wg', 'tun', 'docker', 'br-']

function findLanAddress(): string {
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    if (IGNORED_IFACES.some(p => name.startsWith(p))) continue
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
    if (IGNORED_IFACES.some(p => name.startsWith(p)) || name === 'lo') continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.cidr) {
        subnets.push(addr.cidr)
      }
    }
  }
  return subnets
}

function normalizeSonosState(state: string): SonosStatus['state'] {
  const upper = state.toUpperCase()
  if (upper === 'PLAYING' || upper === 'TRANSITIONING') return 'PLAYING'
  if (upper === 'PAUSED_PLAYBACK' || upper === 'PAUSED') return 'PAUSED_PLAYBACK'
  if (upper === 'STOPPED') return 'STOPPED'
  console.warn('Unknown Sonos state:', state)
  return 'STOPPED'
}

class SonosController extends EventEmitter {
  private devices: Map<string, Sonos> = new Map()
  private deviceInfo: Map<string, SonosDevice> = new Map()
  private selectedDevice: string | null = null
  private discovering = false

  async discoverDevices(timeout = SSDP_TIMEOUT): Promise<SonosDevice[]> {
    if (this.discovering) {
      console.debug('Discovery already in progress')
      return this.getDevices()
    }
    this.discovering = true

    try {
      const lanAddr = findLanAddress()
      const foundIps = new Set<string>()

      // SSDP multicast discovery
      try {
        await this.ssdpDiscover(foundIps, lanAddr, timeout)
      } catch (err) {
        console.warn('SSDP discovery failed:', err)
      }

      // Fallback: TCP port scan
      if (foundIps.size === 0) {
        try {
          await this.tcpScan(foundIps)
        } catch (err) {
          console.warn('TCP scan failed:', err)
        }
      }

      // Build new device map, preserve existing selected device
      const newDevices = new Map<string, Sonos>()
      const newDeviceInfo = new Map<string, SonosDevice>()

      for (const ip of foundIps) {
        try {
          const device = new Sonos(ip)
          const desc = await device.deviceDescription()
          const id = desc.UUID || device.host
          const name = desc.roomName || desc.displayName || device.host
          const group = name // simplified; getAllGroups is slow per-device

          newDevices.set(id, device)
          newDeviceInfo.set(id, { id, name, ip: device.host, model: desc.modelName || '', group })
          this.emit('device-found', newDeviceInfo.get(id))
        } catch (err) {
          console.warn(`Failed to register device at ${ip}:`, err)
        }
      }

      this.devices = newDevices
      this.deviceInfo = newDeviceInfo

      // If previously selected device is gone, clear selection
      if (this.selectedDevice && !this.devices.has(this.selectedDevice)) {
        console.warn('Previously selected device no longer available')
        this.selectedDevice = null
      }

      return this.getDevices()
    } finally {
      this.discovering = false
    }
  }

  private ssdpDiscover(foundIps: Set<string>, lanAddr: string, timeout: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      socket.on('message', (msg, rinfo) => {
        if (msg.toString().includes('Sonos')) {
          foundIps.add(rinfo.address)
        }
      })

      socket.on('error', (err) => {
        console.warn('SSDP socket error:', err)
      })

      try {
        socket.bind(0, lanAddr, () => {
          socket.setMulticastTTL(MULTICAST_TTL)
          socket.setMulticastInterface(lanAddr)
          socket.setBroadcast(true)
          try {
            socket.addMembership(SSDP_MULTICAST_ADDR, lanAddr)
          } catch (err) {
            console.warn('Failed to join SSDP multicast group:', err)
          }

          const search = Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}\r\n` +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
            '\r\n'
          )

          socket.send(search, 0, search.length, SSDP_PORT, SSDP_MULTICAST_ADDR)
          socket.send(search, 0, search.length, SSDP_PORT, '255.255.255.255')
        })
      } catch (err) {
        console.warn('Failed to bind SSDP socket:', err)
      }

      setTimeout(() => {
        try { socket.close() } catch { /* best effort */ }
        resolve()
      }, timeout)
    })
  }

  private tcpScan(foundIps: Set<string>): Promise<void> {
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
          scanPromises.push(this.tryConnect(ip, foundIps))
        }
      }
    }

    return Promise.all(scanPromises).then(() => {})
  }

  private tryConnect(ip: string, foundIps: Set<string>): Promise<void> {
    return new Promise((resolve) => {
      const s = new net.Socket()
      let resolved = false

      const done = () => {
        if (!resolved) {
          resolved = true
          s.destroy()
          resolve()
        }
      }

      s.setTimeout(TCP_SCAN_TIMEOUT)
      s.on('connect', () => {
        foundIps.add(ip)
        done()
      })
      s.on('error', done)
      s.on('timeout', done)
      s.connect(TCP_SCAN_PORT, ip)
      setTimeout(done, TCP_SCAN_RESOLVE_DELAY)
    })
  }

  getDevices(): SonosDevice[] {
    return Array.from(this.deviceInfo.values())
  }

  selectDevice(id: string): boolean {
    if (!this.devices.has(id)) return false
    this.selectedDevice = id
    return true
  }

  hasDevice(): boolean {
    return this.selectedDevice !== null
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

      const sonosTitle = trackInfo?.title || ''
      const sonosArtist = trackInfo?.artist || ''
      const library = getMusicLibrary()
      const matched = library.find(t =>
        t.title === sonosTitle && t.artist === sonosArtist,
      )

      return {
        state: normalizeSonosState(transportInfo),
        track: {
          trackId: matched?.id,
          title: sonosTitle || 'Unknown',
          artist: sonosArtist || 'Unknown',
          album: trackInfo?.album || 'Unknown',
          albumArt: trackInfo?.albumArtURI || '',
          duration: trackInfo?.duration || 0,
          position: trackInfo?.position || 0,
        },
        volume,
        muted,
      }
    } catch (err) {
      console.warn('Failed to get Sonos status:', err)
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

  async playUri(uri: string, title?: string): Promise<void> {
    const device = this.getDevice()
    if (!device) {
      throw new Error('No device selected')
    }

    const trackTitle = title || uri.split('/').pop() || 'Music'
    const escapedTitle = trackTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const metadata = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="0" parentID="A:TRACKS" restricted="true"><dc:title>${escapedTitle}</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">RINCON_AssociatedZPUDN</desc></item></DIDL-Lite>`

    try {
      await device.setAVTransportURI({ uri, metadata })
    } catch (err) {
      console.error(`Failed to play URI on ${device.host}:`, err)
      throw err
    }
  }

  async queueUri(uri: string): Promise<void> {
    await this.getDevice()?.queue(uri)
  }

  async flushQueue(): Promise<void> {
    await this.getDevice()?.flush()
  }
}

export const sonosController = new SonosController()
