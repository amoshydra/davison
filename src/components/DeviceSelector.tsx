import { useEffect } from 'react'
import type { SonosDevice } from '../types'

interface Props {
  devices: SonosDevice[]
  selectedDevice: SonosDevice | null
  isScanning: boolean
  onDiscover: () => void
  onSelect: (id: string) => void
}

export function DeviceSelector({ devices, selectedDevice, isScanning, onDiscover, onSelect }: Props) {
  useEffect(() => {
    if (devices.length === 0 && !isScanning) onDiscover()
  }, [])

  return (
    <div className="device-selector">
      {isScanning ? (
        <div className="scanning-device">
          <span className="spinner" />
          <span>Scanning for Sonos devices...</span>
        </div>
      ) : selectedDevice ? (
        <div className="selected-device">
          <span className="device-indicator" />
          <div className="device-info">
            <span className="device-name">{selectedDevice.name}</span>
            <span className="device-meta">{selectedDevice.model} &middot; {selectedDevice.ip}</span>
          </div>
        </div>
      ) : devices.length > 0 ? (
        <div className="no-device">
          <span>Select a Sonos device below</span>
        </div>
      ) : (
        <div className="no-device">
          <span>No Sonos devices found</span>
        </div>
      )}
      <div className="device-actions">
        <select
          value={selectedDevice?.id || ''}
          onChange={e => e.target.value && onSelect(e.target.value)}
          disabled={isScanning || devices.length === 0}
        >
          {!selectedDevice && <option value="">{devices.length > 0 ? 'Choose a device...' : 'No devices'}</option>}
          {devices.map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={onDiscover} disabled={isScanning}>
          {isScanning ? 'Scanning...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
