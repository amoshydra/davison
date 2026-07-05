interface Props {
  volume: number
  onChange: (volume: number) => void
}

export function VolumeSlider({ volume, onChange }: Props) {
  return (
    <div className="volume-slider">
      <label>Volume</label>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="volume-value">{volume}</span>
    </div>
  )
}
