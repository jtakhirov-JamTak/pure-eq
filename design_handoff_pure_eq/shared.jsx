// shared.jsx — shared utilities for all SpeakEasy directions

const Shared = {
  // Pill progress bar
  ProgressDots: ({ current, total, color = '#1a1d24' }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 24 : 6, height: 6, borderRadius: 3,
          background: i <= current ? color : 'rgba(60,60,67,0.18)',
          transition: 'width .4s cubic-bezier(.2,.8,.2,1), background .3s',
        }}/>
      ))}
    </div>
  ),

  // Scaled iOS device with chrome
  Phone: ({ children, width = 390, height = 844, scale = 0.82 }) => (
    <div style={{
      transform: `scale(${scale})`, transformOrigin: 'top left',
      width, height,
    }}>
      <IOSDevice width={width} height={height}>{children}</IOSDevice>
    </div>
  ),
};

// Hand-drawn voice waveform — subtle joy detail for voice input moments
function VoiceWaveform({ color = '#1a1d24', bars = 14, active = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 24 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 4 + Math.sin(i * 1.2) * 8 + Math.abs(Math.sin(i * 0.4)) * 8;
        return (
          <div key={i} style={{
            width: 3, height: Math.max(3, h), borderRadius: 3,
            background: color, opacity: active ? (0.3 + (i % 3) * 0.2) : 0.25,
          }}/>
        );
      })}
    </div>
  );
}

// Rating pill selector — used across all directions
function RatingScale({ value, colors, onSelect, range = 5, showLabels = true }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: range }).map((_, i) => {
          const n = i + 1;
          const selected = value === n;
          return (
            <div key={n} style={{
              flex: 1, height: 56, borderRadius: 16,
              background: selected ? colors.active : colors.idle,
              color: selected ? colors.activeText : colors.idleText,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 600,
              border: colors.border,
              transition: 'all .2s',
            }}>{n}</div>
          );
        })}
      </div>
      {showLabels && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 10, fontSize: 12,
          color: colors.labelColor, letterSpacing: -0.1,
        }}>
          <span>slightly</span>
          <span>very</span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Shared, VoiceWaveform, RatingScale });
