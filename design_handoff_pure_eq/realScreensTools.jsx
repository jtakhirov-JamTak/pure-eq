// realScreensTools.jsx — Tools hub, Overwhelmed steps, Triggered step

// ═══════════════════════════════════════════════════════════
// 6 · TOOLS HUB — I'm Overwhelmed + I'm Triggered
// ═══════════════════════════════════════════════════════════
function R_ToolsHub({ P }) {
  const cloudy = P.name.startsWith('A');
  return (
    <R_Bg P={P} variant="default">
      {cloudy && <>
        <R_Scatter P={P} x={-40} y={90}  size={130} opacity={0.85}/>
        <R_Scatter P={P} x={260} y={140} size={90}  opacity={0.7}/>
      </>}

      <div style={{ padding: '60px 22px 0' }}>
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: P.warm, color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
        }}>
          When it's a lot
        </div>
        <div style={{
          fontFamily: P.display, fontWeight: 400, fontSize: 32, color: P.ink,
          letterSpacing: -0.9, lineHeight: 1.1, marginBottom: 24,
        }}>
          Two tools for when <span style={{ fontStyle: 'italic' }}>emotions hit hard</span>.
        </div>
      </div>

      <div style={{ padding: '0 22px', flex: 1 }}>
        {/* Overwhelmed */}
        <div style={{
          borderRadius: 28, padding: 20, marginBottom: 12,
          background: cloudy
            ? `linear-gradient(160deg, ${P.brandDeep} 0%, #1A4A8F 100%)`
            : `linear-gradient(160deg, ${P.brandDeep} 0%, ${P.ink} 100%)`,
          color: '#fff', position: 'relative', overflow: 'hidden',
          boxShadow: `0 16px 36px ${P.ink}40`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85, marginBottom: 12 }}>
            ~4 min · guided
          </div>
          <div style={{ fontFamily: P.display, fontWeight: 400, fontSize: 26, letterSpacing: -0.5, lineHeight: 1.1, marginBottom: 6 }}>
            I'm <span style={{ fontStyle: 'italic' }}>overwhelmed</span>
          </div>
          <div style={{ fontSize: 13.5, opacity: 0.88, lineHeight: 1.45, marginBottom: 14, fontWeight: 500, maxWidth: 260 }}>
            Feel, label, validate, regulate, move.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Feel','Label','Validate','Regulate','Move'].map(s => (
              <div key={s} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 100,
                background: 'rgba(255,255,255,0.18)', fontWeight: 700, letterSpacing: 0.3,
              }}>{s}</div>
            ))}
          </div>
        </div>

        {/* Triggered */}
        <div style={{
          borderRadius: 28, padding: 20,
          background: cloudy ? `linear-gradient(160deg, #3A4A66 0%, #1F2A42 100%)` : `linear-gradient(160deg, ${P.warm} 0%, #8E4625 100%)`,
          color: '#fff', position: 'relative', overflow: 'hidden',
          boxShadow: `0 16px 36px ${P.ink}40`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85, marginBottom: 12 }}>
            7 steps · reflect
          </div>
          <div style={{ fontFamily: P.display, fontWeight: 400, fontSize: 26, letterSpacing: -0.5, lineHeight: 1.1, marginBottom: 6 }}>
            I'm <span style={{ fontStyle: 'italic' }}>triggered</span>
          </div>
          <div style={{ fontSize: 13.5, opacity: 0.88, lineHeight: 1.45, marginBottom: 14, fontWeight: 500, maxWidth: 260 }}>
            Catch the spark before it becomes a fire.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Fact','Story','Emotion','Urge','Outcome'].map(s => (
              <div key={s} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 100,
                background: 'rgba(255,255,255,0.18)', fontWeight: 700, letterSpacing: 0.3,
              }}>{s}</div>
            ))}
          </div>
        </div>
      </div>

      <R_TabBar P={P} active="tools"/>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 7 · OVERWHELMED · Feel + body scan (31s timer)
// ═══════════════════════════════════════════════════════════
function R_OwFeel({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Step 3 · Feel"/>

      <div style={{ padding: '10px 22px 0', flex: 1 }}>
        <div style={{ fontFamily: P.display, fontSize: 26, color: P.ink, letterSpacing: -0.5, lineHeight: 1.15, marginBottom: 8 }}>
          Where do you <span style={{ fontStyle: 'italic' }}>feel it</span> in your body?
        </div>
        <div style={{ fontSize: 13, color: P.inkSoft, marginBottom: 20, fontWeight: 500 }}>
          31 seconds. Just notice — no fixing.
        </div>

        {/* Body silhouette with hotspots */}
        <div style={{
          background: P.surface, borderRadius: 26, padding: '20px 18px',
          boxShadow: P.cardShadow, marginBottom: 16, display: 'flex',
        }}>
          <svg width="130" height="220" viewBox="0 0 130 220">
            {/* body */}
            <path d="M65 8 c10 0 16 8 16 18 c0 10 -6 18 -16 18 c-10 0 -16 -8 -16 -18 c0 -10 6 -18 16 -18 z" fill={P.chipBg}/>
            <path d="M40 50 q25 -8 50 0 l8 70 q-33 10 -66 0 z" fill={P.chipBg}/>
            <rect x="45" y="118" width="40" height="90" rx="12" fill={P.chipBg}/>
            {/* chest hotspot */}
            <circle cx="65" cy="78" r="16" fill={P.warm} opacity="0.85"/>
            <circle cx="65" cy="78" r="22" fill={P.warm} opacity="0.25"/>
            {/* throat hotspot */}
            <circle cx="65" cy="48" r="8" fill={P.brand} opacity="0.7"/>
          </svg>
          <div style={{ flex: 1, paddingLeft: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>Tap where</div>
            {[
              { name: 'Chest · tight', on: true, tone: P.warm },
              { name: 'Throat · lump', on: true, tone: P.brand },
              { name: 'Stomach', on: false },
              { name: 'Head', on: false },
              { name: 'Shoulders', on: false },
            ].map((b, i) => (
              <div key={i} style={{
                padding: '7px 10px', marginBottom: 4, borderRadius: 10,
                background: b.on ? `${b.tone}22` : 'transparent',
                fontSize: 13, color: b.on ? P.ink : P.inkSoft, fontWeight: b.on ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.on ? b.tone : P.hair }}/>
                {b.name}
              </div>
            ))}
          </div>
        </div>

        {/* timer ring */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="52" stroke={P.hair} strokeWidth="6" fill="none"/>
              <circle cx="60" cy="60" r="52" stroke={P.brand} strokeWidth="6" fill="none"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * 0.35}`}
                strokeLinecap="round"/>
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontFamily: P.display, fontSize: 32, fontStyle: 'italic', color: P.ink, lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>0:20</div>
              <div style={{ fontSize: 10, color: P.inkMuted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>of 0:31</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 22px 28px' }}>
        <div style={{
          height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: P.ink, fontWeight: 600,
          border: `1px solid ${P.hair}`,
        }}>Skip step</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 8 · OVERWHELMED · Regulate (61s box breathing)
// ═══════════════════════════════════════════════════════════
function R_OwRegulate({ P }) {
  const cloudy = P.name.startsWith('A');
  return (
    <R_Bg P={P} variant="default">
      <R_TopBar P={P} title="Step 4 · Regulate"/>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 22px' }}>
        <div style={{ position: 'relative', width: 240, height: 200, marginBottom: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {cloudy ? (
            <svg width="240" height="200" viewBox="0 0 240 200" style={{ filter: `drop-shadow(0 20px 30px ${P.ink}20)` }}>
              <circle cx="60"  cy="120" r="46" fill="#FFFFFF"/>
              <circle cx="108" cy="80"  r="60" fill="#FFFFFF"/>
              <circle cx="164" cy="90"  r="54" fill="#FFFFFF"/>
              <circle cx="196" cy="122" r="40" fill="#FFFFFF"/>
              <rect x="50" y="120" width="154" height="52" rx="26" fill="#FFFFFF"/>
              <ellipse cx="126" cy="168" rx="82" ry="9" fill="#D6E8F7" opacity="0.6"/>
            </svg>
          ) : (
            // Sage: expanding ring + leaf
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', background: `${P.brand}18` }}/>
              <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: `${P.brand}30` }}/>
              <div style={{ position: 'absolute', inset: 60, borderRadius: '50%', background: P.surface, boxShadow: P.cardShadow }}/>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="50" height="50" viewBox="0 0 64 64">
                  <path d="M32 8 C 18 16, 12 34, 22 52 C 32 44, 42 36, 46 22 C 46 14, 40 8, 32 8 Z" fill={P.brand}/>
                  <path d="M32 12 Q 28 28, 24 48" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', textAlign: 'center', color: P.ink }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>
              Inhale · 4
            </div>
            <div style={{ fontFamily: P.display, fontSize: 48, fontWeight: 400, fontStyle: 'italic', letterSpacing: -1.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              0:32
            </div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4, fontWeight: 600, letterSpacing: 0.3 }}>
              of 1:01
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: P.display, fontSize: 22, fontWeight: 400, color: P.ink, lineHeight: 1.25, letterSpacing: -0.4, marginBottom: 6 }}>
            In for 4, hold 4, <span style={{ fontStyle: 'italic' }}>out for 6</span>.
          </div>
          <div style={{ fontSize: 13, color: P.inkSoft, maxWidth: 260, fontWeight: 500 }}>
            You don't need to do this perfectly. Just slowly.
          </div>
        </div>
      </div>

      <div style={{ padding: '0 22px 28px' }}>
        <div style={{
          height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: P.ink, fontWeight: 600,
          border: `1px solid ${P.hair}`,
        }}>Skip step</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 9 · TRIGGERED · Emotion + intensity slider
// ═══════════════════════════════════════════════════════════
function R_TrigEmotion({ P }) {
  const emotions = ['Angry', 'Hurt', 'Anxious', 'Ashamed', 'Sad', 'Disappointed'];
  // Warm orange-yellow accent for "triggered"
  const hot = '#F39423';
  const hotDeep = '#C9711A';
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Step 3 of 7"/>

      <div style={{ padding: '10px 22px 0', flex: 1 }}>
        <div style={{ fontFamily: P.display, fontSize: 28, color: P.ink, letterSpacing: -0.6, lineHeight: 1.12, marginBottom: 8 }}>
          What's the <span style={{ fontStyle: 'italic' }}>emotion</span>?
        </div>
        <div style={{ fontSize: 13, color: P.inkSoft, marginBottom: 20, fontWeight: 500 }}>
          Pick the closest word, then rate intensity.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {emotions.map((e, i) => (
            <div key={e} style={{
              padding: '10px 16px', borderRadius: 100,
              background: i === 0 ? hot : P.surface,
              color: i === 0 ? '#fff' : P.ink,
              fontSize: 13, fontWeight: 700, letterSpacing: -0.05,
              boxShadow: i === 0 ? `0 8px 18px ${hot}50` : P.softShadow,
            }}>{e}</div>
          ))}
        </div>

        <div style={{
          background: P.surface, borderRadius: 22, padding: 20,
          boxShadow: P.cardShadow,
        }}>
          <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 16 }}>
            Intensity
          </div>

          {/* slider */}
          <div style={{ position: 'relative', height: 10, borderRadius: 5, background: P.chipBg, marginBottom: 20 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '72%', borderRadius: 5, background: `linear-gradient(90deg, ${P.brand} 0%, ${hot} 100%)` }}/>
            <div style={{
              position: 'absolute', left: 'calc(72% - 14px)', top: -8,
              width: 28, height: 28, borderRadius: '50%',
              background: '#fff', boxShadow: P.cardShadow,
              border: `2.5px solid ${hot}`,
            }}/>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 600 }}>slightly</div>
            <div style={{ fontFamily: P.display, fontSize: 38, color: P.ink, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              7<span style={{ fontSize: 18, color: P.inkMuted }}> / 10</span>
            </div>
            <div style={{ fontSize: 11, color: hot, fontWeight: 700 }}>very</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 22px 28px' }}>
        <div style={{
          height: 54, borderRadius: 18, background: hot, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: `0 10px 24px ${hot}60`,
        }}>Continue</div>
      </div>
    </R_Bg>
  );
}

Object.assign(window, { R_ToolsHub, R_OwFeel, R_OwRegulate, R_TrigEmotion });
