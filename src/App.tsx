import { useEffect } from 'react'
import { useDevices, useMusic, useStatus, usePlayback, usePlaylists } from './hooks/useSonosApi'
import { DeviceSelector } from './components/DeviceSelector'
import { MusicBrowser } from './components/MusicBrowser'
import { NowPlaying } from './components/NowPlaying'
import { PlayerControls } from './components/PlayerControls'
import { QueueView } from './components/QueueView'
import { PlaylistPanel } from './components/PlaylistPanel'
import { VolumeSlider } from './components/VolumeSlider'

export function App() {
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
    if (devices.selectedId) {
      status.startPolling()
    }
  }, [devices.selectedId])

  function handlePlayNow(trackId: string) {
    playback.addToQueue([trackId])
  }

  const vol = status.status?.sonos?.volume ?? 50

  return (
    <div className="app">
      <header>
        <h1>Sonos Node</h1>
        <DeviceSelector
          devices={devices.devices}
          selectedDevice={devices.selectedDevice}
          isScanning={devices.isScanning}
          onRefresh={() => devices.discover(true)}
          onSelect={devices.select}
        />
      </header>

      <main>
        <div className="left-panel">
          <MusicBrowser
            tracks={music.tracks}
            onAddToQueue={playback.addToQueue}
            onPlayNow={handlePlayNow}
          />
        </div>

        <div className="center-panel">
          <NowPlaying status={status.status} />
          <PlayerControls
            loopMode={status.status?.queue.loopMode || 'all'}
            onPlay={playback.play}
            onPause={playback.pause}
            onStop={playback.stop}
            onNext={playback.next}
            onPrevious={playback.previous}
            onSetLoop={playback.setLoop}
          />
          <VolumeSlider
            volume={vol}
            onChange={playback.setVolume}
          />
          <QueueView
            queue={status.status?.queue.queue || []}
            currentIndex={status.status?.queue.currentIndex ?? null}
            onRemove={playback.removeFromQueue}
            onClear={playback.clearQueue}
            onJumpTo={playback.jumpTo}
          />
        </div>

        <div className="right-panel">
          <PlaylistPanel
            playlists={playlists.playlists}
            onCreate={playlists.create}
            onDelete={playlists.remove}
            onPlay={playlists.play}
          />
        </div>
      </main>
    </div>
  )
}
