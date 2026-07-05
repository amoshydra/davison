declare module 'sonos' {
  import { EventEmitter } from 'node:events'

  export class Sonos {
    constructor(host: string, port?: number)
    host: string
    port: number
    play(uri?: string): Promise<void>
    pause(): Promise<void>
    stop(): Promise<void>
    next(): Promise<void>
    previous(): Promise<void>
    seek(seconds: number): Promise<void>
    setVolume(volume: number): Promise<void>
    getVolume(): Promise<number>
    setMuted(muted: boolean): Promise<void>
    getMuted(): Promise<boolean>
    getCurrentState(): Promise<string>
    currentTrack(): Promise<{
      title: string
      artist: string
      album: string
      albumArtURI: string
      duration: number
      position: number
      uri: string
    }>
    deviceDescription(): Promise<{
      UUID: string
      roomName: string
      displayName: string
      modelName: string
      modelNumber: string
    }>
    getAllGroups(): Promise<Array<{ Name: string; UUID: string; Coordinator: string }>>
    setAVTransportURI(options: { uri: string; metadata?: string; onlySetUri?: boolean }): Promise<boolean>
    queue(uri: string, positionInQueue?: number): Promise<void>
    flush(): Promise<void>
    setPlayMode(mode: string): Promise<void>
    getPlayMode(): Promise<string>
    startListening(options?: { ignoreSubscriptionErrors?: boolean }): Promise<void>
    stopListening(): Promise<void>
    on(event: string, listener: (...args: any[]) => void): this
    removeAllListeners(event?: string): this
  }

  export function DeviceDiscovery(listener?: (device: Sonos) => void): EventEmitter & {
    on(event: 'DeviceAvailable', listener: (device: Sonos) => void): this
    destroy(): void
  }

  export class AsyncDeviceDiscovery {
    discover(options?: { timeout?: number }): Promise<Sonos>
    discoverMultiple(options?: { timeout?: number }): Promise<Sonos[]>
  }
}
