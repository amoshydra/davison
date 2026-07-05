import type { LoopMode } from '../types'

interface Props {
  loopMode: LoopMode
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onNext: () => void
  onPrevious: () => void
  onSetLoop: (mode: LoopMode) => void
}

export function PlayerControls({
  loopMode,
  onPlay,
  onPause,
  onStop,
  onNext,
  onPrevious,
  onSetLoop,
}: Props) {
  return (
    <div className="player-controls">
      <button onClick={onPrevious} title="Previous">⏮</button>
      <button onClick={onPlay} title="Play">▶</button>
      <button onClick={onPause} title="Pause">⏸</button>
      <button onClick={onStop} title="Stop">⏹</button>
      <button onClick={onNext} title="Next">⏭</button>
      <div className="loop-controls">
        <button
          className={loopMode === 'none' ? 'active' : ''}
          onClick={() => onSetLoop('none')}
          title="No loop"
        >
          🔁
        </button>
        <button
          className={loopMode === 'one' ? 'active' : ''}
          onClick={() => onSetLoop('one')}
          title="Repeat one"
        >
          🔂
        </button>
        <button
          className={loopMode === 'all' ? 'active' : ''}
          onClick={() => onSetLoop('all')}
          title="Repeat all"
        >
          🔄
        </button>
      </div>
    </div>
  )
}
