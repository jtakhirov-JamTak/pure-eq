// realScreens.jsx — Pure EQ, real product screens
// Two palettes rendered from the same structure:
//   A · Soft Pastel  (lavender + peach, rounded, cloudy — reused from direction B)
//   B · Sky & Sage   (pale sky blue + soft sage + cream + terracotta accent)

// ─────────────────────────────────────────────────────────────
// Palettes
// ─────────────────────────────────────────────────────────────
const PAL_A = {
  // Soft Pastel — lifted from direction B
  bgHi:       '#D6EEFF',
  bgMid:      '#A9D9FF',
  brand:      '#4FB0FF',
  brandDeep:  '#2A86E3',
  ink:        '#0E2748',
  inkSoft:    '#4A5E82',
  inkMuted:   '#8AA0C2',
  surface:    '#FFFFFF',
  surfaceTint:'#EEF8FF',
  chipBg:     '#EEF8FF',
  warm:       '#FFD166',
  warmSoft:   '#FFF1CA',
  hair:       'rgba(14,39,72,0.08)',
  danger:     '#D95F5F',
  cardShadow: '0 14px 30px rgba(20,60,130,0.14)',
  softShadow: '0 4px 12px rgba(20,60,130,0.08)',
  sans:       '"DM Sans", Inter, -apple-system, system-ui, sans-serif',
  display:    '"Fraunces", "DM Serif Display", Georgia, serif',
  name:       'A · Soft Pastel',
};

const PAL_B = {
  // Sky & Sage — pale sky + soft sage + warm terracotta
  bgHi:       '#EAF4F2',          // pale sage tint top
  bgMid:      '#D6E7F5',          // pale sky mid
  brand:      '#7FA8A0',          // sage green
  brandDeep:  '#4D7A72',          // deep sage
  ink:        '#1F3A3A',          // deep sage-ink
  inkSoft:    '#4F6B6B',
  inkMuted:   '#8AA2A2',
  surface:    '#FBF8F2',          // warm cream surface
  surfaceTint:'#F2EDE2',          // sand
  chipBg:     '#EEE6D4',          // oat
  warm:       '#C87D5A',          // terracotta accent
  warmSoft:   '#F3D9C8',          // blush terracotta
  hair:       'rgba(31,58,58,0.10)',
  danger:     '#C4623A',
  cardShadow: '0 12px 28px rgba(60,80,78,0.12)',
  softShadow: '0 4px 10px rgba(60,80,78,0.08)',
  sans:       '"DM Sans", Inter, -apple-system, system-ui, sans-serif',
  display:    '"Fraunces", "DM Serif Display", Georgia, serif',
  name:       'B · Sky & Sage',
};

// ─────────────────────────────────────────────────────────────
// Helpers parameterized by palette
// ─────────────────────────────────────────────────────────────
function R_TabBar({ P, active }) {
  const items = [
    { id: 'coach', label: 'Coach' },
    { id: 'tools', label: 'Tools' },
    { id: 'insights', label: 'Insights' },
  ];
  return (
    <div style={{
      margin: '0 16px 24px', padding: 6,
      background: 'rgba(255,255,255,0.9)',
      backdropFilter: 'blur(18px)',
      borderRadius: 28, display: 'flex',
      boxShadow: P.cardShadow,
      border: `1px solid rgba(255,255,255,0.9)`,
    }}>
      {items.map(it => {
        const on = active === it.id;
        return (
          <div key={it.id} style={{
            flex: 1, height: 48, borderRadius: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
            background: on ? P.brand : 'transparent',
            color: on ? '#fff' : P.inkSoft,
            boxShadow: on ? `0 6px 14px ${P.brand}70` : 'none',
          }}>
            {it.label}
          </div>
        );
      })}
    </div>
  );
}

function R_TopBar({ P, left, right, title }) {
  return (
    <div style={{
      paddingTop: 54, padding: '54px 22px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {left || <div style={{
        width: 40, height: 40, borderRadius: 14, background: P.surface,
        boxShadow: P.softShadow,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 14 14"><path d="M10 1L4 7l6 6" stroke={P.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>}
      {title && <div style={{ fontSize: 11, color: P.ink, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</div>}
      {right !== undefined ? right : <div style={{ width: 40 }}/>}
    </div>
  );
}

function R_StepDots({ P, current, total }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 22 : 5, height: 5, borderRadius: 3,
          background: i <= current ? P.brand : `${P.ink}20`,
          transition: 'width .4s cubic-bezier(.2,.8,.2,1), background .3s',
        }}/>
      ))}
    </div>
  );
}

function R_Scatter({ P, x, y, size = 80, opacity = 0.85, blur = 0 }) {
  // Only draw scatters if palette is cloud-style. For sage palette, return subtle shapes.
  if (P.name.startsWith('B')) {
    // soft organic shape (leaf-ish blob)
    return (
      <div style={{
        position: 'absolute', top: y, left: x,
        width: size, height: size * 0.65,
        opacity: opacity * 0.55, filter: blur ? `blur(${blur}px)` : 'none',
        pointerEvents: 'none',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 100 65">
          <ellipse cx="50" cy="32" rx="48" ry="28" fill={P.chipBg}/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{
      position: 'absolute', top: y, left: x,
      width: size, height: size * 0.65,
      opacity, filter: blur ? `blur(${blur}px)` : 'none',
      pointerEvents: 'none',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 100 65">
        <circle cx="22" cy="38" r="18" fill="#FFFFFF"/>
        <circle cx="45" cy="28" r="22" fill="#FFFFFF"/>
        <circle cx="70" cy="32" r="18" fill="#FFFFFF"/>
        <circle cx="82" cy="42" r="14" fill="#FFFFFF"/>
        <rect x="18" y="38" width="68" height="18" rx="9" fill="#FFFFFF"/>
      </svg>
    </div>
  );
}

function R_Bg({ P, children, variant = 'default' }) {
  let gradient;
  if (P.name.startsWith('A')) {
    if (variant === 'warm') {
      gradient = `linear-gradient(180deg, ${P.bgHi} 0%, #FFF1E5 55%, #FFFFFF 100%)`;
    } else if (variant === 'deep') {
      gradient = `linear-gradient(180deg, ${P.bgMid} 0%, ${P.bgHi} 55%, #FFFFFF 100%)`;
    } else {
      gradient = `linear-gradient(180deg, ${P.bgHi} 0%, ${P.bgMid} 55%, ${P.brand} 100%)`;
    }
  } else {
    // Sage palette
    if (variant === 'warm') {
      gradient = `linear-gradient(180deg, ${P.warmSoft} 0%, ${P.surface} 55%, ${P.surface} 100%)`;
    } else if (variant === 'deep') {
      gradient = `linear-gradient(180deg, ${P.bgMid} 0%, ${P.bgHi} 55%, ${P.surface} 100%)`;
    } else {
      gradient = `linear-gradient(180deg, ${P.bgHi} 0%, ${P.bgMid} 55%, ${P.surface} 100%)`;
    }
  }
  return (
    <div style={{
      height: '100%', background: gradient,
      fontFamily: P.sans, display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// Small cloud logo — uses palette surface color for fills
function R_Mark({ P, size = 36 }) {
  const cloudMode = P.name.startsWith('A');
  if (cloudMode) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
        <ellipse cx="34" cy="52" rx="22" ry="3" fill={P.ink} opacity="0.12"/>
        <g>
          <circle cx="18" cy="34" r="12" fill="#FFFFFF"/>
          <circle cx="30" cy="26" r="14" fill="#FFFFFF"/>
          <circle cx="44" cy="30" r="12" fill="#FFFFFF"/>
          <circle cx="50" cy="38" r="9"  fill="#FFFFFF"/>
          <rect x="14" y="34" width="40" height="12" rx="6" fill="#FFFFFF"/>
          <ellipse cx="32" cy="44" rx="22" ry="4" fill={P.bgHi} opacity="0.7"/>
          <circle cx="22" cy="28" r="3" fill="#FFFFFF" opacity="0.9"/>
        </g>
      </svg>
    );
  }
  // Sage mark — a simple leaf-sprig
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
      <circle cx="32" cy="32" r="28" fill={P.surface}/>
      <path d="M32 12 C 20 18, 16 34, 22 46 C 28 42, 36 36, 40 28 C 42 22, 38 16, 32 12 Z"
        fill={P.brand}/>
      <path d="M32 14 Q 30 26, 26 42" stroke={P.surface} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function R_Wordmark({ P, size = 16 }) {
  const cloudMode = P.name.startsWith('A');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <R_Mark P={P} size={size * 1.9}/>
      <div style={{
        fontFamily: cloudMode ? '"Fredoka", "DM Sans", sans-serif' : P.display,
        fontWeight: cloudMode ? 700 : 500,
        fontSize: size * 1.15,
        color: cloudMode ? '#FFFFFF' : P.ink,
        letterSpacing: cloudMode ? -0.4 : -0.3,
        lineHeight: 1,
        WebkitTextStroke: cloudMode ? `${Math.max(1, size / 14)}px ${P.ink}` : undefined,
        textShadow: cloudMode ? `0 2px 0 ${P.ink}30, 0 4px 10px ${P.ink}30` : undefined,
        paintOrder: cloudMode ? 'stroke fill' : undefined,
      }}>
        Pure EQ
      </div>
    </div>
  );
}

Object.assign(window, {
  PAL_A, PAL_B, R_TabBar, R_TopBar, R_StepDots, R_Scatter, R_Bg, R_Mark, R_Wordmark,
});
