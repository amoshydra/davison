import { useState, useMemo, useRef } from 'react'
import { Check } from 'lucide-react'
import type { MusicTrack } from '../types'

interface Props {
  tracks: MusicTrack[]
  onAddToQueue: (ids: string[]) => void
  onPlayNow: (id: string) => void
  onPlayFolderOrNow: (id: string) => void
  onPlayNext?: (ids: string[]) => void
}

interface DirNode {
  name: string
  tracks: MusicTrack[]
  dirs: DirNode[]
}

function buildDirs(tracks: MusicTrack[]): DirNode[] {
  const roots: DirNode[] = []

  for (const track of tracks) {
    const parts = track.relativePath.split('/')
    const fileName = parts.pop()!
    const path = track.baseName ? [track.baseName, ...parts] : parts
    let level = roots

    for (const segment of path) {
      let dir = level.find(d => d.name === segment)
      if (!dir) {
        dir = { name: segment, tracks: [], dirs: [] }
        level.push(dir)
      }
      level = dir.dirs
    }

    level.push({ name: fileName, tracks: [track], dirs: [] })
  }

  // folders first, then loose tracks
  roots.sort((a, b) => {
    const aIsFolder = a.dirs.length > 0 || a.tracks.length > 1
    const bIsFolder = b.dirs.length > 0 || b.tracks.length > 1
    if (aIsFolder && !bIsFolder) return -1
    if (!aIsFolder && bIsFolder) return 1
    return a.name.localeCompare(b.name)
  })

  return roots
}

function flattenIds(dir: DirNode): string[] {
  const ids: string[] = []
  for (const t of dir.tracks) ids.push(t.id)
  for (const sub of dir.dirs) ids.push(...flattenIds(sub))
  return ids
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function matches(t: MusicTrack, q: string): boolean {
  const ql = q.toLowerCase()
  return (
    t.title.toLowerCase().includes(ql) ||
    t.artist.toLowerCase().includes(ql) ||
    t.album.toLowerCase().includes(ql) ||
    t.fileName.toLowerCase().includes(ql)
  )
}

function TrackRow({
  track,
  depth,
  selected,
  selectMode,
  onPlay,
  onToggle,
}: {
  track: MusicTrack
  depth: number
  selected: boolean
  selectMode: boolean
  onPlay: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={`track-item${selected ? ' selected' : ''}`}
      style={{ paddingLeft: `${16 + depth * 20}px` }}
      onClick={onPlay}
      onContextMenu={e => e.preventDefault()}
    >
      <span
        className={`track-check${selected ? ' checked' : ''}`}
        onClick={e => { e.stopPropagation(); onToggle() }}
      >
        {selected && <Check size={14} />}
      </span>
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}</span>
      </div>
      <span className="track-duration">{formatDuration(track.duration)}</span>
    </div>
  )
}

function DirSection({
  dir,
  depth,
  search,
  selected,
  selectMode,
  onPlay,
  onToggle,
  onAddToQueue,
  onPlayNext,
}: {
  dir: DirNode
  depth: number
  search: string
  selected: Set<string>
  selectMode: boolean
  onPlay: (id: string) => void
  onToggle: (id: string) => void
  onAddToQueue: (ids: string[]) => void
  onPlayNext?: (ids: string[]) => void
}) {
  const [collapsed, setCollapsed] = useState(depth > 0)

  const isLeaf = dir.dirs.length === 0 && dir.tracks.length <= 1
  const track = isLeaf ? dir.tracks[0] : null

  const allIds = useMemo(() => flattenIds(dir), [dir])
  const hasContent = useMemo(() => {
    if (!search) return true
    return dir.tracks.some(t => matches(t, search)) || dir.dirs.some(sub => {
      const s = search
      return sub.tracks.some(t => matches(t, s))
    })
  }, [dir, search])

  if (!hasContent) return null

  if (isLeaf && track) {
    return (
      <TrackRow
        track={track}
        depth={depth}
        selected={selected.has(track.id)}
        selectMode={selectMode}
        onPlay={() => onPlay(track.id)}
        onToggle={() => onToggle(track.id)}
      />
    )
  }

  if (allIds.length === 0) return null

  return (
    <div className="dir-section">
      <div
        className="dir-header"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="dir-arrow">{collapsed ? '▶' : '▼'}</span>
        <span className="dir-name">{dir.name}</span>
        <span className="dir-count">{allIds.length}</span>
        <span className="dir-actions" onClick={e => e.stopPropagation()}>
          <button className="dir-btn" onClick={() => onAddToQueue(allIds)}>Add</button>
        </span>
      </div>
      {!collapsed && (
        <div className="dir-children">
          {dir.dirs.map(sub => (
            <DirSection
              key={`${dir.name}/${sub.name}`}
              dir={sub}
              depth={depth + 1}
              search={search}
              selected={selected}
              selectMode={selectMode}
              onPlay={onPlay}
              onToggle={onToggle}
              onAddToQueue={onAddToQueue}
              onPlayNext={onPlayNext}
            />
          ))}
          {dir.tracks.map(t => {
            if (search && !matches(t, search)) return null
            return (
              <TrackRow
                key={t.id}
                track={t}
                depth={depth + 1}
                selected={selected.has(t.id)}
                selectMode={selectMode}
                onPlay={() => onPlay(t.id)}
                onToggle={() => onToggle(t.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MusicBrowser({ tracks, onAddToQueue, onPlayNow, onPlayFolderOrNow, onPlayNext }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout>>()

  const roots = useMemo(() => buildDirs(tracks), [tracks])
  const q = search.toLowerCase()

  const filtered = useMemo(() => {
    if (!search) return roots
    function filterDir(d: DirNode): DirNode | null {
      const subDirs = d.dirs.map(filterDir).filter(Boolean) as DirNode[]
      const subTracks = d.tracks.filter(t => matches(t, q))
      if (subDirs.length === 0 && subTracks.length === 0) return null
      return { name: d.name, tracks: subTracks, dirs: subDirs }
    }
    return roots.map(filterDir).filter(Boolean) as DirNode[]
  }, [roots, search, q])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    if (next.size === 0 && selectMode) {
      setSelectMode(false)
    }
  }

  function handlePlay(id: string) {
    if (selectMode) {
      toggle(id)
    } else {
      onPlayFolderOrNow(id)
    }
  }

  function handleToggle(id: string) {
    toggle(id)
    if (!selectMode) {
      setSelectMode(true)
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function handleTouchStart(_e: React.TouchEvent, id: string) {
    pressTimer.current = setTimeout(() => {
      setSelectMode(true)
      toggle(id)
    }, 400)
  }

  function handleTouchEnd() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = undefined
    }
  }

  return (
    <div className="music-browser">
      <div className="browser-header">
        <input
          type="text"
          placeholder="Search tracks, artists, albums..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {selectMode && (
          <div className="browser-actions">
            <span className="select-count">{selected.size} selected</span>
            <button className="browser-done" onClick={exitSelectMode}>
              Clear
            </button>
          </div>
        )}
        {selectMode && selected.size > 0 && (
          <div className="select-actions-inline">
            <button onClick={() => { onPlayNow(Array.from(selected)[0]); exitSelectMode() }}>
              Play
            </button>
            {onPlayNext && (
              <button onClick={() => { onPlayNext(Array.from(selected)); exitSelectMode() }}>
                Play Next
              </button>
            )}
            <button onClick={() => { onAddToQueue(Array.from(selected)); exitSelectMode() }}>
              Add{selected.size > 1 ? ` ${selected.size}` : ''}
            </button>
          </div>
        )}
      </div>

      <div className={`track-list${selectMode ? ' select-mode' : ''}`}>
        {filtered.map(root => (
          <DirSection
            key={root.name}
            dir={root}
            depth={0}
            search={q}
            selected={selected}
            selectMode={selectMode}
            onPlay={handlePlay}
            onToggle={handleToggle}
            onAddToQueue={onAddToQueue}
            onPlayNext={onPlayNext}
          />
        ))}
      </div>
    </div>
  )
}
