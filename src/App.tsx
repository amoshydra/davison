import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Music, ListMusic, Disc3, ListOrdered, Settings, MonitorSpeaker } from 'lucide-react'
import { useDevices, useMusic, useStatus, usePlayback, usePlaylists } from './hooks/useSonosApi'
import { useLocalPlayback } from './hooks/useLocalPlayback'
import type { SonosStatus, MusicTrack, ServerStatus } from './types'
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
  const [localMode, setLocalMode] = useState(() => {
    const stored = localStorage.getItem('davison:localMode')
    if (stored === 'true' || stored === '1') return true
    if (typeof window !== 'undefined' && window.location.search.includes('local')) return true
    return false
  })

  const devices = useDevices()
  const music = useMusic()
  const status = useStatus()
  const playback = usePlayback()
  const localPlayback = useLocalPlayback()
  const playlists = usePlaylists()

  const toggleLocalMode = useCallback(() => {
    setLocalMode(prev => {
      const next = !prev
      localStorage.setItem('davison:localMode', next ? '1' : '0')
      if (!next) status.fetchStatus()
      return next
    })
  }, [status])

  useEffect(() => {
    music.load()
    playlists.load()
  }, [])

  useEffect(() => {
    if (!localMode && devices.selectedId) status.startPolling()
    return () => status.stopPolling()
  }, [localMode, devices.selectedId])

  // ── Conditional handlers ──
  const activePlayback = localMode ? localPlayback : playback

  // Helper: map track IDs to MusicTrack objects for local mode
  const resolveTracks = useCallback((trackIds: string[]): MusicTrack[] =>
    trackIds.map(id => music.tracks.find(t => t.id === id)).filter(Boolean) as MusicTrack[],
  [music.tracks])

  const handlePlayNow = useCallback(async (trackIds: string[]) => {
    if (localMode) {
      const tracks = resolveTracks(trackIds)
      if (tracks.length > 0) localPlayback.playNow(tracks)
      setView('now-playing')
    } else {
      await playback.playNow(trackIds)
      await status.fetchStatus()
      setView('now-playing')
    }
  }, [localMode, resolveTracks, localPlayback, playback, status])

  const handlePlayFolderOrNow = useCallback(async (trackId: string) => {
    if (localMode) {
      const track = music.tracks.find(t => t.id === trackId)
      if (!track) return
      const parentDir = track.relativePath.split('/').slice(0, -1).join('/')
      const folderTracks = music.tracks.filter(t => {
        const dir = t.relativePath.split('/').slice(0, -1).join('/')
        return dir === parentDir && t.baseIdx === track.baseIdx
      }).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      // Rotate so clicked track plays first (matches server behavior)
      const startIdx = folderTracks.findIndex(t => t.id === trackId)
      const rotated = [...folderTracks.slice(startIdx), ...folderTracks.slice(0, startIdx)]
      localPlayback.playNow(rotated)
      setView('now-playing')
    } else {
      await playback.playFolderOrNow(trackId)
      await status.fetchStatus()
      setView('now-playing')
    }
  }, [localMode, music.tracks, localPlayback, playback, status])

  const handleAddToQueue = useCallback(async (trackIds: string[]) => {
    if (localMode) {
      const tracks = resolveTracks(trackIds)
      localPlayback.addToQueue(tracks)
    } else {
      await playback.addToQueue(trackIds)
    }
  }, [localMode, resolveTracks, localPlayback, playback])

  const handlePlayNext = useCallback(async (trackIds: string[]) => {
    if (localMode) {
      const tracks = resolveTracks(trackIds)
      localPlayback.playNext(tracks)
    } else {
      await playback.playNext(trackIds)
    }
  }, [localMode, resolveTracks, localPlayback, playback])

  // ── Build status object — real Sonos or synthetic local ──
  const displayStatus: ServerStatus | null = localMode
    ? (localPlayback.currentTrack ? {
        sonos: {
          state: localPlayback.playing ? 'PLAYING' : 'PAUSED_PLAYBACK',
          track: {
            trackId: localPlayback.currentTrack.id,
            title: localPlayback.currentTrack.title,
            artist: localPlayback.currentTrack.artist,
            album: localPlayback.currentTrack.album,
            albumArt: '',
            duration: localPlayback.duration || localPlayback.currentTrack.duration,
            position: localPlayback.position,
          },
          volume: 50,
          muted: false,
        },
        queue: {
          queue: localPlayback.queue,
          history: [],
          currentIndex: localPlayback.currentIndex,
          loopMode: 'all' as const,
          autoPlay: true,
          currentTrack: localPlayback.currentTrack,
          nextTrack: localPlayback.queue[(localPlayback.currentIndex ?? -1) + 1] ?? null,
        },
      } : null)
    : status.status

  // ── Callbacks — route to local or Sonos ──
  const cbPlay = localMode
    ? localPlayback.togglePlayPause
    : (() => { setSyncWithTimeout(setSyncState, 'PLAYING'); playback.play() })
  const cbPause = localMode
    ? localPlayback.togglePlayPause
    : (() => { setSyncWithTimeout(setSyncState, 'PAUSED_PLAYBACK'); playback.pause() })
  const cbNext = localMode
    ? localPlayback.next
    : (() => { setSyncWithTimeout(setSyncState, 'PLAYING'); playback.next() })
  const cbPrevious = localMode
    ? localPlayback.previous
    : (() => { setSyncWithTimeout(setSyncState, 'PLAYING'); playback.previous() })
  const cbVolume = localMode
    ? localPlayback.setVolume
    : ((v: number) => { setSyncWithTimeout(setSyncVolume, v); playback.setVolume(v) })
  const cbSeek = localMode
    ? localPlayback.seekTo
    : playback.seekTo

  const vol = displayStatus?.sonos?.volume ?? 50
  const sonos = displayStatus?.sonos
  const coverTrackId = sonos?.track.trackId || displayStatus?.queue.currentTrack?.id || null
  const coverUrl = coverTrackId ? `/api/music/cover/${coverTrackId}` : null
  const fallbackKey = sonos ? `${sonos.track.title}|${sonos.track.artist}|${sonos.track.album}` : ''
  const hashFallback = fallbackKey ? hashToGradient(fallbackKey) : 'none'

  // ── Sonos optimistic sync (unused in local mode) ──
  const [syncState, setSyncState] = useState<SonosStatus['state'] | null>(null)
  const [syncVolume, setSyncVolume] = useState<number | null>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout>>()

  function setSyncWithTimeout<T>(setter: (v: T | null) => void, value: T) {
    setter(value)
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      setSyncState(null)
      setSyncVolume(null)
    }, 5000)
  }

  useEffect(() => {
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current) }
  }, [])

  useEffect(() => {
    if (localMode) return
    const s = status.status?.sonos
    if (!s) return
    if (syncState !== null && s.state === syncState) setSyncState(null)
    if (syncVolume !== null && s.volume === syncVolume) setSyncVolume(null)
  }, [localMode, status.status?.sonos])

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
        <div className="sidebar-logo">D</div>
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
              onAddToQueue={handleAddToQueue}
              onPlayNow={handlePlayNow}
              onPlayFolderOrNow={handlePlayFolderOrNow}
              onPlayNext={handlePlayNext}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'now-playing' ? 'flex' : 'none' }}>
            <NowPlayingView
              status={displayStatus}
              volume={syncVolume ?? vol}
              loopMode={displayStatus?.queue.loopMode || 'all'}
              deviceName={localMode ? 'Local' : (devices.selectedDevice?.name || '')}
              syncState={localMode ? null : syncState}
              syncVolume={localMode ? null : syncVolume}
              onPlay={cbPlay}
              onPause={cbPause}
              onNext={cbNext}
              onPrevious={cbPrevious}
              onSetVolume={cbVolume}
              onSetLoop={playback.setLoop}
              onSeek={cbSeek}
            />
          </div>

          <div className="view-stack" style={{ display: view === 'queue' ? 'flex' : 'none' }}>
            <QueueView
              queue={displayStatus?.queue.queue || []}
              currentIndex={displayStatus?.queue.currentIndex ?? null}
              currentTrack={displayStatus?.queue.currentTrack || null}
              hasDevice={!!displayStatus?.sonos}
              onRemove={localMode ? localPlayback.removeFromQueue : playback.removeFromQueue}
              onClear={localMode ? localPlayback.clearQueue : playback.clearQueue}
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
              localMode={localMode}
              onToggleLocal={toggleLocalMode}
              onRefresh={() => devices.discover(true)}
              onSelect={devices.select}
            />
          </div>
        </div>

        {/* Bottom player bar — hidden when now-playing */}
        {view !== 'now-playing' && (
          <PlayerBar
            status={displayStatus}
            volume={syncVolume ?? vol}
            deviceName={localMode ? 'Local' : (devices.selectedDevice?.name || '')}
            syncState={localMode ? null : syncState}
            syncVolume={localMode ? null : syncVolume}
            onPlay={cbPlay}
            onPause={cbPause}
            onNext={cbNext}
            onPrevious={cbPrevious}
            onSetVolume={cbVolume}
            onClickTrack={() => setView('now-playing')}
          />
        )}

        {/* Bottom navigation (mobile) */}
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
