import type { SonosDevice } from '../types'
import { MonitorSpeaker } from 'lucide-react'

interface Props {
  devices: SonosDevice[]
  selectedDevice: SonosDevice | null
  isScanning: boolean
  localMode: boolean
  onToggleLocal: () => void
  onRefresh: () => void
  onSelect: (id: string) => void
}

export function DeviceSelector({ devices, selectedDevice, isScanning, localMode, onToggleLocal, onRefresh, onSelect }: Props) {
  return (
    <div className="settings-view">
      <div className="view-panel-header" style={{ padding: 0 }}>
        <h2>Settings</h2>
      </div>

      <div className="settings-row">
        <label>Playback mode</label>
        <button className="local-toggle" onClick={onToggleLocal}>
          <MonitorSpeaker size={16} />
          {localMode ? 'Play on this device' : 'Play on Sonos'}
        </button>
      </div>

      {!localMode && (
        <>
          <div className="settings-row">
            <label>Sonos device</label>
            <select
              value={selectedDevice?.id || ''}
              onChange={e => e.target.value && onSelect(e.target.value)}
              disabled={isScanning || devices.length === 0}
            >
              {!selectedDevice && <option value="">Select device...</option>}
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="settings-row">
            <label />
            <button onClick={onRefresh} disabled={isScanning}>
              {isScanning ? 'Scanning...' : 'Refresh'}
            </button>
          </div>

          <div className="settings-status">
            {selectedDevice ? (
              <>
                <span className="settings-dot online" />
                <span>{selectedDevice.name} ({selectedDevice.ip})</span>
              </>
            ) : devices.length > 0 ? (
              <>
                <span className="settings-dot offline" />
                <span>Select a device above</span>
              </>
            ) : isScanning ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                <span>Scanning for devices...</span>
              </>
            ) : (
              <>
                <span className="settings-dot offline" />
                <span>No devices found</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
