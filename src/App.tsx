import { useState, useEffect } from 'react'
import { Music, ListMusic, Disc3, ListOrdered, Settings } from 'lucide-react'
import { useDevices, useMusic, useStatus, usePlayback, usePlaylists } from './hooks/useSonosApi'
import { useAlbumColor } from './hooks/useAlbumColor'
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

  function handlePlayNow(trackId: string) {
    playback.playNow([trackId])
    setView('now-playing')
  }

  const vol = status.status?.sonos?.volume ?? 50
  const coverTrackId = status.status?.sonos?.track.trackId || status.status?.queue.currentTrack?.id || null
  const coverUrl = coverTrackId ? `/api/music/cover/${coverTrackId}` : null
  const sonos = status.status?.sonos
  const fallbackKey = sonos ? `${sonos.track.title}|${sonos.track.artist}|${sonos.track.album}` : undefined
  const albumColor = useAlbumColor(coverUrl, fallbackKey)

  return (
    <div className="app" style={{ '--cover-rgb': albumColor } as React.CSSProperties}>
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
        {/* Mobile tab header */}
        <div className="tab-header">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-btn${view === t.id ? ' active' : ''}`}
              onClick={() => setView(t.id)}
            >
              <t.icon size={20} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content panels */}
        <div className="view-panel">
          {view === 'library' && (
            <div className="scroll-area" style={{ paddingTop: 12 }}>
              <MusicBrowser
                tracks={music.tracks}
                onAddToQueue={playback.addToQueue}
                onPlayNow={handlePlayNow}
                onPlayNext={playback.playNext}
              />
            </div>
          )}

          {view === 'now-playing' && (
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
          )}

          {view === 'queue' && (
            <QueueView
              queue={status.status?.queue.queue || []}
              currentIndex={status.status?.queue.currentIndex ?? null}
              currentTrack={status.status?.queue.currentTrack || null}
              onRemove={playback.removeFromQueue}
              onClear={playback.clearQueue}
              onJumpTo={playback.jumpTo}
            />
          )}

          {view === 'playlists' && (
            <PlaylistPanel
              playlists={playlists.playlists}
              onCreate={playlists.create}
              onDelete={playlists.remove}
              onPlay={playlists.play}
            />
          )}

          {view === 'settings' && (
            <DeviceSelector
              devices={devices.devices}
              selectedDevice={devices.selectedDevice}
              isScanning={devices.isScanning}
              onRefresh={() => devices.discover(true)}
              onSelect={devices.select}
            />
          )}
        </div>
      </div>

      {/* Bottom player bar */}
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
    </div>
  )
}
