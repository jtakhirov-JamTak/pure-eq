// directionB.jsx — "Sky & Clouds"
// Bright sky blue background, fluffy white cloud logo/cards, peppered bright whites.
// Cartoony, optimistic, reassuring — conversations feel lighter under a clear sky.

const B_TOKENS = {
  // sky gradient stops (light → saturated)
  skyHi:   '#D6EEFF',
  skyMid:  '#A9D9FF',
  skyBrand:'#4FB0FF',           // signature bright sky blue
  skyDeep: '#2A86E3',
  skyInk:  '#0E2748',           // deep navy for text
  inkSoft: '#4A5E82',
  inkMuted:'#8AA0C2',
  cloudWhite: '#FFFFFF',
  cloudEdge:  'rgba(30,70,140,0.08)',
  cloudShadow: 'rgba(20,60,130,0.14)',
  sun:     '#FFD166',           // warm sun accent
  sunSoft: '#FFF1CA',
  hair:    'rgba(14,39,72,0.08)',
  sans:    '"DM Sans", Inter, -apple-system, system-ui, sans-serif',
  display: '"Fraunces", "DM Serif Display", Georgia, serif',
};
const bT = B_TOKENS;

// ── Reusable: Cartoony cloud logo ──
// Built from overlapping circles — readable as a cloud at 28px, and expressive at 120px.
function CloudLogo({ size = 36, tone = 'white', hasFace = false }) {
  const fills = tone === 'white'
    ? { body: '#FFFFFF', shade: '#E8F1FB', stroke: '#0E2748' }
    : { body: bT.skyBrand, shade: bT.skyDeep, stroke: '#FFFFFF' };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
      {/* soft drop shadow */}
      <ellipse cx="34" cy="52" rx="22" ry="3" fill="#0E2748" opacity="0.12"/>
      {/* cloud body: 4 bumps + base */}
      <g>
        <circle cx="18" cy="34" r="12" fill={fills.body}/>
        <circle cx="30" cy="26" r="14" fill={fills.body}/>
        <circle cx="44" cy="30" r="12" fill={fills.body}/>
        <circle cx="50" cy="38" r="9"  fill={fills.body}/>
        <rect x="14" y="34" width="40" height="12" rx="6" fill={fills.body}/>
        {/* underside shading */}
        <ellipse cx="32" cy="44" rx="22" ry="4" fill={fills.shade} opacity="0.6"/>
        {/* cheek highlight */}
        <circle cx="22" cy="28" r="3" fill="#FFFFFF" opacity="0.9"/>
      </g>
      {hasFace && (
        <g fill={fills.stroke}>
          <circle cx="26" cy="32" r="1.6"/>
          <circle cx="38" cy="32" r="1.6"/>
          <path d="M28 37 Q32 40 36 37" stroke={fills.stroke} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </g>
      )}
    </svg>
  );
}

// Wordmark beside the cloud — letters rendered as fluffy white clouds
function SpeakEasyMark({ size = 18 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <CloudLogo size={size * 1.9} hasFace />
      <div style={{
        fontFamily: '"Fredoka", "Baloo 2", "DM Sans", sans-serif',
        fontWeight: 700,
        fontSize: size * 1.15,
        color: '#FFFFFF',
        letterSpacing: -0.4,
        lineHeight: 1,
        // chunky cloud outline + soft drop shadow for "puffy" feel
        WebkitTextStroke: `${Math.max(1, size / 14)}px ${bT.skyInk}`,
        textShadow: `0 2px 0 rgba(14,39,72,0.18), 0 4px 10px rgba(14,39,72,0.18)`,
        paintOrder: 'stroke fill',
      }}>
        SpeakEasy
      </div>
    </div>
  );
}

// Decorative scatter clouds for backgrounds
function ScatterCloud({ x, y, size = 80, opacity = 0.85, blur = 0 }) {
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

// Cloud-shaped card — uses SVG filter for puffy edges on a white block
const CLOUD_CARD_FILTER = `
<svg width="0" height="0" style="position:absolute">
  <defs>
    <filter id="cloudy">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6"/>
      <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"/>
    </filter>
  </defs>
</svg>`;

function B_Home() {
  return (
    <div style={{
      height: '100%',
      background: `linear-gradient(180deg, ${bT.skyHi} 0%, ${bT.skyMid} 55%, ${bT.skyBrand} 100%)`,
      fontFamily: bT.sans, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* scatter clouds */}
      <ScatterCloud x={-30}  y={110} size={130} opacity={0.9}/>
      <ScatterCloud x={260}  y={60}  size={90}  opacity={0.85}/>
      <ScatterCloud x={180}  y={420} size={150} opacity={0.6} blur={1}/>
      <ScatterCloud x={-40}  y={520} size={110} opacity={0.5} blur={2}/>
      {/* sun */}
      <div style={{
        position: 'absolute', top: 58, right: -14, width: 92, height: 92, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, #FFF4D1 0%, ${bT.sun} 55%, #FFB74D 100%)`,
        boxShadow: `0 0 40px rgba(255,209,102,0.6), 0 0 80px rgba(255,209,102,0.35)`,
        opacity: 0.55,
      }}/>

      <div style={{ paddingTop: 60, padding: '60px 22px 0', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <SpeakEasyMark size={17}/>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: bT.cloudWhite, boxShadow: `0 4px 12px ${bT.cloudShadow}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: bT.skyInk,
          }}>M</div>
        </div>

        <div style={{
          fontFamily: bT.display, fontWeight: 400, fontSize: 38, color: bT.skyInk,
          letterSpacing: -1, lineHeight: 1.05, marginBottom: 10,
        }}>
          Hey, Maya.<br/>
          <span style={{ fontStyle: 'italic' }}>Blue skies ahead?</span>
        </div>
        <div style={{ fontSize: 15, color: bT.inkSoft, lineHeight: 1.5, letterSpacing: -0.15, marginBottom: 26, fontWeight: 500 }}>
          Better conversations start here.
        </div>
      </div>

      <div style={{ padding: '0 22px', flex: 1, position: 'relative' }}>
        {/* primary cloud card — Prepare */}
        <div style={{
          position: 'relative', marginBottom: 14,
        }}>
          <div style={{
            background: bT.cloudWhite,
            borderRadius: 32,
            padding: '22px 22px 24px',
            boxShadow: `0 18px 40px ${bT.cloudShadow}, 0 2px 0 rgba(255,255,255,0.8) inset`,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* little cloud-puff decorations on corners */}
            <div style={{
              position: 'absolute', top: -10, right: -10, width: 70, height: 70, borderRadius: '50%',
              background: bT.cloudWhite, boxShadow: `0 6px 14px ${bT.cloudShadow}`,
            }}/>
            <div style={{
              position: 'absolute', top: -18, right: 34, width: 42, height: 42, borderRadius: '50%',
              background: bT.cloudWhite,
            }}/>

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  padding: '4px 10px', borderRadius: 100, background: bT.skyBrand,
                  color: bT.cloudWhite, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                }}>Prepare</div>
                <div style={{ fontSize: 11, color: bT.inkMuted, fontWeight: 600 }}>· 4–6 min</div>
              </div>
              <div style={{
                fontFamily: bT.display, fontWeight: 400, fontSize: 26, color: bT.skyInk,
                letterSpacing: -0.6, lineHeight: 1.1, marginBottom: 6,
              }}>
                Walk in <span style={{ fontStyle: 'italic' }}>ready</span>,<br/>land it well.
              </div>
              <div style={{ fontSize: 14, color: bT.inkSoft, lineHeight: 1.45, letterSpacing: -0.1, marginBottom: 18 }}>
                9 guided prompts to help you show up clear.
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 100,
                background: bT.skyBrand, color: bT.cloudWhite,
                fontSize: 14, fontWeight: 700, letterSpacing: -0.05,
                boxShadow: `0 6px 16px rgba(79,176,255,0.45)`,
              }}>
                Start
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8M6 2l4 4-4 4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <B_SmallCloud title="Review" body="Look back on what landed, what missed, and why." tint={bT.sunSoft} big/>
          <B_SmallCloud title="Repair" body="Mend what went sideways." tint="#E8F1FB" big/>
        </div>

        {/* active conversations — collapsed, tap to expand */}
        <div style={{
          background: bT.cloudWhite, borderRadius: 18, padding: '14px 16px',
          boxShadow: `0 8px 20px ${bT.cloudShadow}`,
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: bT.skyHi,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h10M2 10h6" stroke={bT.skyDeep} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: bT.skyInk, letterSpacing: -0.15 }}>Active conversations</div>
            <div style={{ fontSize: 12, color: bT.inkMuted, marginTop: 2, fontWeight: 500 }}>3 ongoing · tap to expand</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke={bT.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <B_TabBar active="coach"/>
    </div>
  );
}

function B_SmallCloud({ title, body, tint, big }) {
  return (
    <div style={{
      background: bT.cloudWhite, borderRadius: 24, padding: big ? 18 : 16,
      boxShadow: `0 8px 20px ${bT.cloudShadow}`,
      position: 'relative', overflow: 'hidden', minHeight: big ? 128 : 'auto',
    }}>
      <div style={{
        position: 'absolute', top: -14, right: -14, width: 62, height: 62, borderRadius: '50%',
        background: tint,
      }}/>
      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: bT.display, fontWeight: 400, fontSize: big ? 26 : 22, color: bT.skyInk,
          letterSpacing: -0.4, marginBottom: 6, fontStyle: 'italic',
        }}>{title}</div>
        <div style={{ fontSize: big ? 13 : 12, color: bT.inkSoft, lineHeight: 1.4, letterSpacing: -0.05, fontWeight: 500 }}>{body}</div>
      </div>
    </div>
  );
}

function B_TabBar({ active }) {
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
      boxShadow: `0 10px 28px ${bT.cloudShadow}`,
      border: `1px solid rgba(255,255,255,0.9)`,
    }}>
      {items.map(it => {
        const on = active === it.id;
        return (
          <div key={it.id} style={{
            flex: 1, height: 48, borderRadius: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
            background: on ? bT.skyBrand : 'transparent',
            color: on ? bT.cloudWhite : bT.inkSoft,
            boxShadow: on ? `0 6px 14px rgba(79,176,255,0.45)` : 'none',
          }}>
            {it.label}
          </div>
        );
      })}
    </div>
  );
}

// ── Prepare · voice input ──
function B_Prepare() {
  return (
    <div style={{
      height: '100%',
      background: `linear-gradient(180deg, ${bT.skyHi} 0%, #EEF8FF 60%, #FFFFFF 100%)`,
      fontFamily: bT.sans, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <ScatterCloud x={-40} y={90}  size={130} opacity={0.85}/>
      <ScatterCloud x={270} y={150} size={90}  opacity={0.7} blur={1}/>
      <ScatterCloud x={-30} y={640} size={140} opacity={0.55} blur={2}/>

      <div style={{ paddingTop: 54, padding: '54px 22px 0', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 14, background: bT.cloudWhite,
            boxShadow: `0 4px 12px ${bT.cloudShadow}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10 1L4 7l6 6" stroke={bT.skyInk} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <Shared.ProgressDots current={2} total={9} color={bT.skyBrand} />
          <div style={{ fontSize: 12, color: bT.inkMuted, fontWeight: 700, letterSpacing: 0.3 }}>3 / 9</div>
        </div>

        <div style={{
          display: 'inline-block',
          padding: '4px 12px', borderRadius: 100, background: bT.skyBrand, color: bT.cloudWhite,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14,
        }}>
          Prepare · about them
        </div>
        <div style={{
          fontFamily: bT.display, fontWeight: 400, fontSize: 28, color: bT.skyInk,
          lineHeight: 1.1, letterSpacing: -0.7, marginBottom: 12,
        }}>
          What might be<br/>
          <span style={{ fontStyle: 'italic' }}>going on</span> for them?
        </div>
        <div style={{ fontSize: 14, color: bT.inkSoft, lineHeight: 1.5, letterSpacing: -0.1, marginBottom: 22, fontWeight: 500 }}>
          Best guess — and what evidence do you <em>actually</em> have?
        </div>
      </div>

      <div style={{ padding: '0 22px', flex: 1, position: 'relative' }}>
        {/* puffy cloud-shaped input card */}
        <div style={{ position: 'relative' }}>
          {/* extra cloud bumps above for puffy silhouette */}
          <div style={{ position: 'absolute', top: -16, left: 30, width: 70, height: 50, borderRadius: '50%', background: bT.cloudWhite, boxShadow: `0 -2px 6px ${bT.cloudShadow}` }}/>
          <div style={{ position: 'absolute', top: -22, left: 86, width: 56, height: 42, borderRadius: '50%', background: bT.cloudWhite }}/>
          <div style={{ position: 'absolute', top: -14, right: 28, width: 62, height: 46, borderRadius: '50%', background: bT.cloudWhite }}/>
          <div style={{
            background: bT.cloudWhite, borderRadius: 28, padding: '22px 20px 16px',
            boxShadow: `0 14px 34px ${bT.cloudShadow}, 0 2px 0 rgba(255,255,255,0.9) inset`,
            minHeight: 200, display: 'flex', flexDirection: 'column', position: 'relative',
          }}>
            <div style={{
              fontSize: 11, color: bT.inkMuted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
              marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: bT.skyBrand,
                animation: 'caret 1.2s ease-in-out infinite',
              }}/>
              Listening
            </div>
            <div style={{ fontSize: 16, color: bT.skyInk, lineHeight: 1.55, letterSpacing: -0.2, flex: 1, marginBottom: 14 }}>
              She's been quiet at dinners for weeks. I <span style={{ color: bT.skyBrand, fontWeight: 700 }}>think</span> she's stressed about work, but honestly I'm mostly guessing<span style={{ color: bT.inkMuted }}> — she hasn't said anything specific, and I…</span>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '12px 14px', borderRadius: 100,
              background: `linear-gradient(135deg, ${bT.skyHi} 0%, #E5F1FD 100%)`,
              gap: 14,
            }}>
              <VoiceWaveform color={bT.skyBrand} />
              <div style={{ fontSize: 14, fontWeight: 700, color: bT.skyDeep, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3 }}>
                0:14
              </div>
              <div style={{
                width: 46, height: 46, borderRadius: '50%',
                background: bT.skyBrand,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 14px rgba(79,176,255,0.55)',
              }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: '#fff' }}/>
              </div>
            </div>
          </div>
        </div>

        {/* chips */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: bT.inkMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            If you're stuck
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['what they said', 'what they did', 'their week', 'their stressors'].map(chip => (
              <div key={chip} style={{
                padding: '8px 14px', borderRadius: 100, background: bT.cloudWhite,
                fontSize: 12, color: bT.skyInk, fontWeight: 600,
                boxShadow: `0 3px 8px ${bT.cloudShadow}`,
                letterSpacing: -0.05,
              }}>{chip}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 22px 28px', position: 'relative' }}>
        <div style={{
          height: 56, borderRadius: 20,
          background: bT.skyBrand, color: bT.cloudWhite,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: '0 10px 24px rgba(79,176,255,0.5)',
        }}>
          Continue
        </div>
      </div>
    </div>
  );
}

// ── Overwhelmed · breath ──
function B_Overwhelmed() {
  return (
    <div style={{
      height: '100%',
      background: `linear-gradient(180deg, ${bT.skyMid} 0%, ${bT.skyHi} 50%, #FFFFFF 100%)`,
      fontFamily: bT.sans, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <ScatterCloud x={-50} y={140} size={160} opacity={0.8} blur={0.5}/>
      <ScatterCloud x={250} y={100} size={100} opacity={0.7}/>
      <ScatterCloud x={-40} y={600} size={140} opacity={0.6} blur={1}/>
      <ScatterCloud x={260} y={660} size={110} opacity={0.55} blur={1}/>

      <div style={{ paddingTop: 54, padding: '54px 22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14, background: bT.cloudWhite,
          boxShadow: `0 4px 12px ${bT.cloudShadow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke={bT.skyInk} strokeWidth="1.8" strokeLinecap="round"/></svg>
        </div>
        <div style={{ fontSize: 11, color: bT.skyInk, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Step 4 · Regulate
        </div>
        <div style={{ width: 40 }}/>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 22px', position: 'relative' }}>
        {/* Giant breathing cloud */}
        <div style={{ position: 'relative', width: 280, height: 220, marginBottom: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* soft aura */}
          <div style={{
            position: 'absolute', width: 320, height: 260, borderRadius: '50%',
            background: `radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, transparent 65%)`,
          }}/>
          <svg width="280" height="220" viewBox="0 0 280 220" style={{ position: 'relative', filter: `drop-shadow(0 20px 30px ${bT.cloudShadow})` }}>
            <circle cx="70"  cy="130" r="52" fill="#FFFFFF"/>
            <circle cx="125" cy="90"  r="68" fill="#FFFFFF"/>
            <circle cx="190" cy="100" r="60" fill="#FFFFFF"/>
            <circle cx="225" cy="135" r="44" fill="#FFFFFF"/>
            <rect x="55" y="130" width="180" height="60" rx="30" fill="#FFFFFF"/>
            {/* underside soft shade */}
            <ellipse cx="145" cy="182" rx="95" ry="10" fill="#D6E8F7" opacity="0.6"/>
            {/* highlight */}
            <ellipse cx="98" cy="74" rx="16" ry="8" fill="#FFFFFF" opacity="0.95"/>
          </svg>
          {/* centered timer */}
          <div style={{
            position: 'absolute', textAlign: 'center', color: bT.skyInk,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>
              Inhale · 4
            </div>
            <div style={{
              fontFamily: bT.display, fontSize: 56, fontWeight: 400, fontStyle: 'italic',
              letterSpacing: -2, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>
              0:32
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, fontWeight: 600, letterSpacing: 0.3 }}>
              of 1:01
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: bT.display, fontSize: 26, fontWeight: 400, color: bT.skyInk,
            lineHeight: 1.2, letterSpacing: -0.5, marginBottom: 10,
          }}>
            In for 4, hold 4, <span style={{ fontStyle: 'italic' }}>out for 6</span>.
          </div>
          <div style={{ fontSize: 14, color: bT.inkSoft, lineHeight: 1.5, letterSpacing: -0.1, maxWidth: 280, fontWeight: 500 }}>
            You don't need to do this perfectly. Just slowly.
          </div>
        </div>
      </div>

      <div style={{ padding: '0 22px 32px', position: 'relative' }}>
        <div style={{
          height: 50, borderRadius: 18, background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: bT.skyInk, fontWeight: 600, letterSpacing: -0.05,
          border: `1px solid rgba(255,255,255,0.8)`,
        }}>
          Skip step
        </div>
      </div>
    </div>
  );
}

// ── Insights ──
function B_Insights() {
  return (
    <div style={{
      height: '100%',
      background: `linear-gradient(180deg, ${bT.skyHi} 0%, #EEF8FF 35%, #FFFFFF 100%)`,
      fontFamily: bT.sans, display: 'flex', flexDirection: 'column', overflow: 'auto', position: 'relative',
    }}>
      <ScatterCloud x={-30} y={90} size={110} opacity={0.7}/>
      <ScatterCloud x={270} y={170} size={80} opacity={0.55} blur={1}/>

      <div style={{ paddingTop: 60, padding: '60px 22px 0', position: 'relative' }}>
        <div style={{
          display: 'inline-block',
          padding: '4px 12px', borderRadius: 100, background: bT.skyBrand, color: bT.cloudWhite,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Last 28 days
        </div>
        <div style={{
          fontFamily: bT.display, fontWeight: 400, fontSize: 34, color: bT.skyInk,
          letterSpacing: -1, lineHeight: 1.08, marginBottom: 22,
        }}>
          Your <span style={{ fontStyle: 'italic' }}>patterns</span> are who you are.
        </div>
      </div>

      <div style={{ padding: '0 22px 22px', position: 'relative' }}>
        {/* top pattern */}
        <div style={{
          background: bT.cloudWhite, borderRadius: 28, padding: 22,
          boxShadow: `0 14px 30px ${bT.cloudShadow}`,
          marginBottom: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', bottom: -60, right: -40, width: 160, height: 160,
            borderRadius: '50%', background: bT.skyHi, opacity: 0.7,
          }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ padding: '4px 10px', background: bT.skyBrand, color: bT.cloudWhite, borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Pattern
              </div>
              <div style={{ fontSize: 11, color: bT.inkMuted, fontWeight: 600 }}>Established</div>
            </div>
            <div style={{ fontFamily: bT.display, fontSize: 22, fontWeight: 400, color: bT.skyInk, letterSpacing: -0.4, lineHeight: 1.2, marginBottom: 10 }}>
              You <span style={{ fontStyle: 'italic' }}>withdraw</span> when you feel criticized.
            </div>
            <div style={{ fontSize: 13, color: bT.inkSoft, lineHeight: 1.5, letterSpacing: -0.05, marginBottom: 18, fontWeight: 500 }}>
              Seen in 7 of 12 entries. Strongest with Dad and in 1:1s.
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
              {[5,3,7,4,8,5,9,6,4,8,9,7].map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: h * 4, borderRadius: 4,
                  background: i >= 9 ? bT.skyBrand : bT.skyHi,
                }}/>
              ))}
            </div>
          </div>
        </div>

        {/* counter pattern — sunny */}
        <div style={{
          background: `linear-gradient(135deg, ${bT.sunSoft} 0%, #FFE6AB 100%)`,
          borderRadius: 28, padding: 22, marginBottom: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -24, right: -24, width: 80, height: 80, borderRadius: '50%',
            background: `radial-gradient(circle, #FFD166 0%, #FFB74D 100%)`, opacity: 0.85,
            boxShadow: '0 0 30px rgba(255,209,102,0.5)',
          }}/>
          <div style={{ padding: '4px 10px', background: '#C27803', color: '#FFF9E6', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'inline-block', marginBottom: 12 }}>
            How you land
          </div>
          <div style={{ fontFamily: bT.display, fontSize: 20, fontWeight: 400, color: '#6A3E00', letterSpacing: -0.4, lineHeight: 1.2, position: 'relative' }}>
            Calmer within an hour, <span style={{ fontStyle: 'italic' }}>4 out of 5 times</span>.
          </div>
        </div>

        {/* blind spot — night sky */}
        <div style={{
          background: `linear-gradient(135deg, ${bT.skyInk} 0%, #1A3869 100%)`,
          color: '#E8F1FB', borderRadius: 28, padding: 22, position: 'relative', overflow: 'hidden',
        }}>
          {/* stars */}
          {[{x: 230, y: 18}, {x: 260, y: 40}, {x: 200, y: 54}, {x: 280, y: 74}].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', left: s.x, top: s.y,
              width: 3, height: 3, borderRadius: '50%', background: '#FFF',
              boxShadow: '0 0 6px #FFF',
            }}/>
          ))}
          <div style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.15)', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'inline-block', marginBottom: 12 }}>
            Blind spot
          </div>
          <div style={{ fontFamily: bT.display, fontSize: 20, fontWeight: 400, letterSpacing: -0.4, lineHeight: 1.2 }}>
            You often assume <span style={{ fontStyle: 'italic', color: bT.sun }}>intent</span> before asking.
          </div>
          <div style={{ fontSize: 13, opacity: 0.78, lineHeight: 1.5, letterSpacing: -0.05, marginTop: 8, fontWeight: 500 }}>
            In 5 recent Prepare entries, you skipped the reality-check step.
          </div>
        </div>
      </div>

      <B_TabBar active="insights"/>
    </div>
  );
}

// ── Tools hub ──
function B_Tools() {
  return (
    <div style={{
      height: '100%',
      background: `linear-gradient(180deg, ${bT.skyHi} 0%, ${bT.skyMid} 100%)`,
      fontFamily: bT.sans, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <ScatterCloud x={-40} y={90}  size={130} opacity={0.85}/>
      <ScatterCloud x={260} y={140} size={90}  opacity={0.7}/>
      <ScatterCloud x={200} y={470} size={110} opacity={0.55} blur={1}/>
      <ScatterCloud x={-40} y={560} size={130} opacity={0.5}  blur={2}/>

      <div style={{ paddingTop: 60, padding: '60px 22px 0', position: 'relative' }}>
        <div style={{
          display: 'inline-block',
          padding: '4px 12px', borderRadius: 100, background: bT.sun, color: '#6B4A00',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
        }}>
          When storms roll in
        </div>
        <div style={{
          fontFamily: bT.display, fontWeight: 400, fontSize: 34, color: bT.skyInk,
          letterSpacing: -1, lineHeight: 1.08, marginBottom: 28,
        }}>
          Two tools for when <span style={{ fontStyle: 'italic' }}>emotions hit hard</span>.
        </div>
      </div>

      <div style={{ padding: '0 22px', flex: 1, position: 'relative' }}>
        {/* Overwhelmed — stormy */}
        <div style={{
          borderRadius: 32, padding: 22, marginBottom: 14,
          background: `linear-gradient(160deg, ${bT.skyDeep} 0%, #1A4A8F 100%)`,
          color: bT.cloudWhite, position: 'relative', overflow: 'hidden',
          boxShadow: `0 18px 40px rgba(30,70,140,0.35)`,
        }}>
          {/* rain streaks */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
            {Array.from({length: 12}).map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 12 + i * 26, top: 70 + (i % 3) * 16,
                width: 1.5, height: 14, background: '#FFFFFF', transform: 'rotate(12deg)', borderRadius: 2,
              }}/>
            ))}
          </div>
          {/* tucked cloud on top */}
          <div style={{ position: 'absolute', top: 14, right: 14, opacity: 0.9 }}>
            <CloudLogo size={56}/>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85, marginBottom: 14 }}>
              ~4 min · guided
            </div>
            <div style={{
              fontFamily: bT.display, fontWeight: 400, fontSize: 28, letterSpacing: -0.6, lineHeight: 1.1, marginBottom: 8,
            }}>
              I'm <span style={{ fontStyle: 'italic' }}>overwhelmed</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, lineHeight: 1.4, letterSpacing: -0.05, marginBottom: 16, fontWeight: 500, maxWidth: 260 }}>
              Settle the storm.<br/>Feel, clear your mind, reset.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Feel','Label','Validate','Regulate','Move'].map(s => (
                <div key={s} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 100,
                  background: 'rgba(255,255,255,0.2)', fontWeight: 700, letterSpacing: 0.3,
                }}>{s}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Triggered — thundercloud */}
        <div style={{
          borderRadius: 32, padding: 22,
          background: `linear-gradient(160deg, #3A4A66 0%, #1F2A42 100%)`,
          color: bT.cloudWhite, position: 'relative', overflow: 'hidden',
          boxShadow: `0 18px 40px rgba(20,30,55,0.4)`,
        }}>
          {/* dark cloud silhouette */}
          <svg width="140" height="90" viewBox="0 0 140 90" style={{ position: 'absolute', top: 8, right: 10, opacity: 0.55 }}>
            <circle cx="30" cy="50" r="22" fill="#1A2238"/>
            <circle cx="58" cy="36" r="28" fill="#1A2238"/>
            <circle cx="90" cy="42" r="24" fill="#1A2238"/>
            <circle cx="112" cy="52" r="18" fill="#1A2238"/>
            <rect x="24" y="50" width="92" height="22" rx="11" fill="#1A2238"/>
          </svg>
          {/* lightning bolt */}
          <svg width="34" height="58" viewBox="0 0 34 58" style={{ position: 'absolute', top: 44, right: 54, filter: 'drop-shadow(0 0 14px rgba(255,228,120,0.8))' }}>
            <path d="M20 0 L4 30 L14 30 L8 58 L30 24 L18 24 L24 0 Z" fill="#FFE478" stroke="#FFF4B5" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
          {/* small rain dots */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }}>
            {Array.from({length: 8}).map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 20 + i * 20, top: 110 + (i % 2) * 10,
                width: 1.5, height: 8, background: '#A8C5FF', transform: 'rotate(14deg)', borderRadius: 2,
              }}/>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              fontSize: 11, color: '#FFE478', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14,
            }}>
              7 steps · reflect
            </div>
            <div style={{
              fontFamily: bT.display, fontWeight: 400, fontSize: 28, letterSpacing: -0.6, lineHeight: 1.1, marginBottom: 8,
            }}>
              I'm <span style={{ fontStyle: 'italic' }}>triggered</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, lineHeight: 1.4, letterSpacing: -0.05, marginBottom: 16, fontWeight: 500, maxWidth: 260 }}>
              Catch the spark.<br/>Overcome your trigger in real time.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Fact','Story','Emotion','Urge','Outcome'].map(s => (
                <div key={s} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 100,
                  background: 'rgba(255,228,120,0.18)', color: '#FFE478', fontWeight: 700, letterSpacing: 0.3,
                }}>{s}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <B_TabBar active="tools"/>
    </div>
  );
}

Object.assign(window, { B_Home, B_Prepare, B_Overwhelmed, B_Insights, B_Tools, CloudLogo, SpeakEasyMark });
