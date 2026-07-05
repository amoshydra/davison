import { useState, useEffect, useRef } from 'react'
import { Music, ListMusic, Disc3, ListOrdered, Settings } from 'lucide-react'
import { useDevices, useMusic, useStatus, usePlayback, usePlaylists } from './hooks/useSonosApi'
import { DeviceSelector } from './components/DeviceSelector'
import { MusicBrowser } from './components/MusicBrowser'
import { NowPlayingView } from './components/NowPlaying'
import { PlayerBar } from './components/PlayerBar'
import { QueueView } from './components/QueueView'
import { PlaylistPanel } from './components/PlaylistPanel'

type View = 'library' | 'now-playing' | 'queue' | 'playlists' | 'settings'

const tabs: { id: View; label: string; icon: typeof Music }[] = [
  { id: 'library', label: 'Library', icon: Music },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'now-playing', label: 'Playing', icon: Disc3 },
  { id: 'playlists', label: 'Lists', icon: ListMusic },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function hashToGradient(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  hash = Math.abs(hash)
  const hue = hash % 360
  const sat = 55 + (hash % 25)
  const lig = 40 + (hash % 12)
  return `linear-gradient(135deg, hsl(${hue}, ${sat}%, ${lig}%), hsl(${(hue + 60) % 360}, ${sat - 10}%, ${lig - 5}%))`
}

export function App() {
  const [view, setView] = useState<View>('library')
  const devices = useDevices()
  const music = useMusic()
  const status = useStatus()
  const playback = usePlayback()
  const playlists = usePlaylists()

  useEffect(() => {
    status.startPolling()
    music.load()
    playlists.load()
    return () => status.stopPolling()
  }, [])

  useEffect(() => {
    if (devices.selectedId) status.startPolling()
  }, [devices.selectedId])

  async function handlePlayNow(trackIds: string[]) {
    await playback.playNow(trackIds)
    await status.fetchStatus()
    setView('now-playing')
  }

  async function handleFolderOrNow(trackId: string) {
    await playback.playFolderOrNow(trackId)
    await status.fetchStatus()
    setView('now-playing')
  }

  const vol = status.status?.sonos?.volume ?? 50
  const sonos = status.status?.sonos
  const coverTrackId = sonos?.track.trackId || status.status?.queue.currentTrack?.id || null
  const coverUrl = coverTrackId ? `/api/music/cover/${coverTrackId}` : null
  const fallbackKey = sonos ? `${sonos.track.title}|${sonos.track.artist}|${sonos.track.album}` : ''
  const hashFallback = fallbackKey ? hashToGradient(fallbackKey) : 'none'

  const [coverFailed, setCoverFailed] = useState(false)
  const prevCoverUrl = useRef(coverUrl)

  useEffect(() => {
    if (coverUrl === prevCoverUrl.current && coverUrl !== null) return
    prevCoverUrl.current = coverUrl

    if (!coverUrl) {
      setCoverFailed(true)
      return
    }

    setCoverFailed(false)
    const img = new Image()
    img.onload = () => setCoverFailed(false)
    img.onerror = () => setCoverFailed(true)
    img.src = coverUrl

    return () => { img.onload = null; img.onerror = null }
  }, [coverUrl])

  const coverBg = coverUrl && !coverFailed ? `url(${coverUrl})` : hashFallback

  return (
    <div className="app" style={{ '--cover-bg': coverBg } as React.CSSProperties}>
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">S</div>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`sidebar-btn${view === t.id ? ' active' : ''}`}
            onClick={() => setView(t.id)}
            title={t.label}
          >
            <t.icon size={20} />
          </button>
        ))}
      </nav>

      <div className="app-main">
        {/* Content panels — all mounted, only active one is visible */}
        <div className="view-panel">
          <div className="view-stack" style={{ display: view === 'library' ? 'flex' : 'none' }}>
            <MusicBrowser
              tracks={music.tracks}
              onAddToQueue={playback.addToQueue}
              onPlayNow={handlePlayNow}
              onPlayFolderOrNow={handleFolderOrNow}
              onPlayNext={playback.playNext}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'now-playing' ? 'flex' : 'none' }}>
            <NowPlayingView
              status={status.status}
              volume={vol}
              loopMode={status.status?.queue.loopMode || 'all'}
              deviceName={devices.selectedDevice?.name}
              onPlay={playback.play}
              onPause={playback.pause}
              onNext={playback.next}
              onPrevious={playback.previous}
              onSetVolume={playback.setVolume}
              onSetLoop={playback.setLoop}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'queue' ? 'flex' : 'none' }}>
            <QueueView
              queue={status.status?.queue.queue || []}
              currentIndex={status.status?.queue.currentIndex ?? null}
              currentTrack={status.status?.queue.currentTrack || null}
              hasDevice={!!status.status?.sonos}
              onRemove={playback.removeFromQueue}
              onClear={playback.clearQueue}
              onJumpTo={playback.jumpTo}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'playlists' ? 'flex' : 'none' }}>
            <PlaylistPanel
              playlists={playlists.playlists}
              onCreate={playlists.create}
              onDelete={playlists.remove}
              onPlay={playlists.play}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'settings' ? 'flex' : 'none' }}>
            <DeviceSelector
              devices={devices.devices}
              selectedDevice={devices.selectedDevice}
              isScanning={devices.isScanning}
              onRefresh={() => devices.discover(true)}
              onSelect={devices.select}
            />
          </div>
        </div>

        {/* Bottom player bar — in-flow, above bottom-nav, hidden when now-playing */}
        {view !== 'now-playing' && (
          <PlayerBar
            status={status.status}
            volume={vol}
            deviceName={devices.selectedDevice?.name}
            onPlay={playback.play}
            onPause={playback.pause}
            onNext={playback.next}
            onPrevious={playback.previous}
            onSetVolume={playback.setVolume}
            onClickTrack={() => setView('now-playing')}
          />
        )}

        {/* Bottom navigation (mobile) — always at the very bottom */}
        <nav className="bottom-nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`bottom-tab${view === t.id ? ' active' : ''}`}
              onClick={() => setView(t.id)}
            >
              <t.icon size={20} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
