import { useEffect } from 'react'
import type { SonosDevice } from '../types'

interface Props {
  devices: SonosDevice[]
  selectedId: string | null
  onDiscover: () => void
  onSelect: (id: string) => void
}

export function DeviceSelector({ devices, selectedId, onDiscover, onSelect }: Props) {
  useEffect(() => {
    if (devices.length === 0) onDiscover()
  }, [])

  return (
    <div className="device-selector">
      <h3>Sonos Device</h3>
      <select
        value={selectedId || ''}
        onChange={e => e.target.value && onSelect(e.target.value)}
      >
        <option value="">Select a device...</option>
        {devices.map(d => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.group})
          </option>
        ))}
      </select>
      <button onClick={onDiscover}>Refresh</button>
    </div>
  )
}
