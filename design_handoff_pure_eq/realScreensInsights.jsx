// realScreensInsights.jsx — Insights, Onboarding, Paywall

// ═══════════════════════════════════════════════════════════
// 10 · INSIGHTS — Your Style + Main Pattern + With [Name]
// ═══════════════════════════════════════════════════════════
function R_Insights({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <div style={{ padding: '60px 22px 16px' }}>
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: P.brand, color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Last 28 days · 12 entries
        </div>
        <div style={{
          fontFamily: P.display, fontWeight: 400, fontSize: 32, color: P.ink,
          letterSpacing: -0.9, lineHeight: 1.08, marginBottom: 18,
        }}>
          Your <span style={{ fontStyle: 'italic' }}>patterns</span> are who you are.
        </div>
      </div>

      <div style={{ padding: '0 22px 14px', flex: 1, overflow: 'auto' }}>
        {/* Box 1 — Your Style */}
        <div style={{
          background: P.surface, borderRadius: 24, padding: 20, boxShadow: P.cardShadow, marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            Your Style
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: P.brand, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: P.display, fontSize: 20, fontStyle: 'italic',
            }}>W</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: P.display, fontSize: 20, color: P.ink, letterSpacing: -0.3, lineHeight: 1.15 }}>
                Withdrawer
              </div>
              <div style={{ fontSize: 12, color: P.inkMuted, marginTop: 2, fontWeight: 500 }}>
                Secondary: <span style={{ color: P.warm, fontWeight: 700 }}>Peacekeeper</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: P.inkSoft, lineHeight: 1.5, fontWeight: 500 }}>
            You pull back under stress to protect the room. It preserves the peace — and often hides what you need.
          </div>
        </div>

        {/* Box 2 — Main Pattern */}
        <div style={{
          background: P.surface, borderRadius: 24, padding: 20, boxShadow: P.cardShadow, marginBottom: 12,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Your Main Pattern
            </div>
            <div style={{ fontSize: 10, color: P.brand, fontWeight: 700, letterSpacing: 0.5 }}>ESTABLISHED</div>
          </div>
          <div style={{ fontFamily: P.display, fontSize: 20, color: P.ink, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 10 }}>
            You <span style={{ fontStyle: 'italic' }}>withdraw</span> when you feel criticized.
          </div>
          <div style={{ fontSize: 12, color: P.inkSoft, lineHeight: 1.5, marginBottom: 14, fontWeight: 500 }}>
            Seen in 7 of 12 entries. Strongest with Dad.
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, marginBottom: 10 }}>
            {[5,3,7,4,8,5,9,6,4,8,9,7].map((h, i) => (
              <div key={i} style={{
                flex: 1, height: h * 3.6, borderRadius: 3,
                background: i >= 9 ? P.brand : P.chipBg,
              }}/>
            ))}
          </div>
          <div style={{
            padding: '10px 12px', borderRadius: 12, background: P.warmSoft,
            fontSize: 12, color: P.ink, lineHeight: 1.4, fontWeight: 500,
          }}>
            <span style={{ fontWeight: 700 }}>Shift noticed:</span> last 3 entries, you paused before withdrawing.
          </div>
        </div>

        {/* Box 3 — With Dad */}
        <div style={{
          background: `linear-gradient(135deg, ${P.ink} 0%, ${P.brandDeep} 100%)`,
          color: '#fff', borderRadius: 24, padding: 20, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            With Dad
          </div>
          <div style={{ fontFamily: P.display, fontSize: 20, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 8 }}>
            Comments on food → you go <span style={{ fontStyle: 'italic', color: P.warm }}>quiet</span>.
          </div>
          <div style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.5, fontWeight: 500 }}>
            4 of 5 dinners. Emerging — keep logging to confirm.
          </div>
        </div>
      </div>

      <R_TabBar P={P} active="insights"/>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 11 · ONBOARDING · Communication Profile result
// ═══════════════════════════════════════════════════════════
function R_OnbResult({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <div style={{ padding: '60px 22px 14px' }}>
        <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
          Your communication profile
        </div>
        <div style={{
          fontFamily: P.display, fontWeight: 400, fontSize: 32, color: P.ink,
          letterSpacing: -0.9, lineHeight: 1.08, marginBottom: 4,
        }}>
          You're a <span style={{ fontStyle: 'italic' }}>Withdrawer</span>.
        </div>
        <div style={{ fontSize: 14, color: P.inkSoft, fontWeight: 500 }}>
          With notes of Peacekeeper.
        </div>
      </div>

      <div style={{ padding: '12px 22px 0', flex: 1, overflow: 'auto' }}>
        {/* At your best */}
        <div style={{
          background: P.surface, borderRadius: 20, padding: 18, boxShadow: P.softShadow, marginBottom: 10,
          borderLeft: `3px solid ${P.brand}`,
        }}>
          <div style={{ fontSize: 10, color: P.brand, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            At your best
          </div>
          <div style={{ fontSize: 14, color: P.ink, lineHeight: 1.5, fontWeight: 500 }}>
            You read rooms well. You don't need to win — you want everyone to feel okay.
          </div>
        </div>

        {/* Under stress */}
        <div style={{
          background: P.surface, borderRadius: 20, padding: 18, boxShadow: P.softShadow, marginBottom: 10,
          borderLeft: `3px solid ${P.warm}`,
        }}>
          <div style={{ fontSize: 10, color: P.warm, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            Under stress
          </div>
          <div style={{ fontSize: 14, color: P.ink, lineHeight: 1.5, fontWeight: 500 }}>
            You go quiet and hope it passes. The other person often reads silence as agreement — or anger.
          </div>
        </div>

        {/* Best place to start */}
        <div style={{
          background: P.ink, color: '#fff', borderRadius: 20, padding: 18, marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            Best place to start
          </div>
          <div style={{ fontFamily: P.display, fontSize: 18, letterSpacing: -0.3, lineHeight: 1.25, marginBottom: 10 }}>
            Try "<span style={{ fontStyle: 'italic' }}>I'm Overwhelmed</span>" next time you notice yourself pulling back.
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5, fontWeight: 500 }}>
            It'll help you stay in the room.
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 22px 28px' }}>
        <div style={{
          height: 54, borderRadius: 18, background: P.brand, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: `0 10px 24px ${P.brand}60`,
        }}>Start with Overwhelmed →</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 12 · PAYWALL — $8.99/mo · $69.99/yr
// ═══════════════════════════════════════════════════════════
function R_Paywall({ P }) {
  const cloudy = P.name.startsWith('A');
  return (
    <R_Bg P={P} variant="default">
      {cloudy && <>
        <R_Scatter P={P} x={-30} y={100} size={130} opacity={0.85}/>
        <R_Scatter P={P} x={260} y={60}  size={90}  opacity={0.7}/>
      </>}

      <div style={{ padding: '60px 22px 14px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <R_Mark P={P} size={56}/>
        </div>
        <div style={{
          fontFamily: P.display, fontWeight: 400, fontSize: 30, color: P.ink,
          letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 8,
        }}>
          Keep going with<br/>
          <span style={{ fontStyle: 'italic' }}>Pure EQ Premium</span>.
        </div>
        <div style={{ fontSize: 14, color: P.inkSoft, fontWeight: 500, padding: '0 20px' }}>
          Your free 7-day window ends today.
        </div>
      </div>

      <div style={{ padding: '8px 22px 0', flex: 1 }}>
        {/* features */}
        <div style={{ background: P.surface, borderRadius: 20, padding: 16, boxShadow: P.softShadow, marginBottom: 16 }}>
          {[
            'Unlimited Prepare, Review, Repair',
            'Unlimited Overwhelmed & Triggered',
            'Full Insights — your style, patterns, people',
            'Private, on-device. No accounts.',
          ].map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderTop: i > 0 ? `1px solid ${P.hair}` : 'none',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: P.brand,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ fontSize: 13.5, color: P.ink, fontWeight: 500 }}>{t}</div>
            </div>
          ))}
        </div>

        {/* plans */}
        <div style={{
          background: P.surface, borderRadius: 22, padding: 14,
          boxShadow: P.cardShadow, marginBottom: 10,
          border: `2px solid ${P.brand}`, position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -10, right: 14,
            padding: '3px 10px', borderRadius: 100, background: P.brand, color: '#fff',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>Best value · save 35%</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: P.ink, fontWeight: 700, marginBottom: 2 }}>Annual</div>
              <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 500 }}>$5.83/mo billed yearly</div>
            </div>
            <div style={{ fontFamily: P.display, fontSize: 26, color: P.ink, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
              $69.99
            </div>
          </div>
        </div>

        <div style={{
          background: P.surface, borderRadius: 22, padding: 14, boxShadow: P.softShadow, marginBottom: 12,
          border: `1px solid ${P.hair}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: P.ink, fontWeight: 700, marginBottom: 2 }}>Monthly</div>
              <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 500 }}>Cancel anytime</div>
            </div>
            <div style={{ fontFamily: P.display, fontSize: 22, color: P.inkSoft, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>
              $8.99
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 22px 28px' }}>
        <div style={{
          height: 54, borderRadius: 18, background: P.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: -0.1, marginBottom: 10,
        }}>Start Premium</div>
        <div style={{
          textAlign: 'center', fontSize: 12, color: P.inkMuted, fontWeight: 600,
        }}>Maybe later</div>
      </div>
    </R_Bg>
  );
}

Object.assign(window, { R_Insights, R_OnbResult, R_Paywall });
