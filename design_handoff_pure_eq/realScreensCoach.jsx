// realScreensCoach.jsx — Coach hub, Prepare steps, Prepare feedback, Threads
// All copy lifted from the actual Pure EQ code.

// ═══════════════════════════════════════════════════════════
// 1 · COACH HUB — Prepare / Review / Repair + Active Conversations
// ═══════════════════════════════════════════════════════════
function R_CoachHub({ P }) {
  const cloudy = P.name.startsWith('A');
  return (
    <R_Bg P={P} variant="default">
      {cloudy && <>
        <R_Scatter P={P} x={-30} y={110} size={130} opacity={0.9}/>
        <R_Scatter P={P} x={260} y={60}  size={90}  opacity={0.85}/>
        <R_Scatter P={P} x={-40} y={520} size={110} opacity={0.5} blur={2}/>
      </>}
      {!cloudy && <>
        <R_Scatter P={P} x={-40} y={120} size={160} opacity={0.8}/>
        <R_Scatter P={P} x={240} y={80}  size={110} opacity={0.7}/>
      </>}

      <div style={{ padding: '60px 22px 0', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <R_Wordmark P={P} size={16}/>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: P.surface, boxShadow: P.softShadow,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: P.ink,
          }}>M</div>
        </div>

        <div style={{
          fontFamily: P.display, fontWeight: 400, fontSize: 34, color: P.ink,
          letterSpacing: -0.9, lineHeight: 1.08, marginBottom: 8,
        }}>
          Hi, Maya.<br/>
          <span style={{ fontStyle: 'italic' }}>What do you need today?</span>
        </div>
        <div style={{ fontSize: 14, color: P.inkSoft, lineHeight: 1.5, marginBottom: 22, fontWeight: 500 }}>
          Prepare, Review, or Repair a conversation.
        </div>
      </div>

      <div style={{ padding: '0 22px', flex: 1, position: 'relative' }}>
        {/* Prepare — primary */}
        <div style={{
          background: P.surface, borderRadius: 28, padding: '20px 20px 22px',
          boxShadow: P.cardShadow, marginBottom: 12, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              padding: '3px 10px', borderRadius: 100, background: P.brand,
              color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
            }}>Prepare</div>
            <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 600 }}>· 9 steps</div>
          </div>
          <div style={{
            fontFamily: P.display, fontSize: 22, color: P.ink, letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 4,
          }}>
            A conversation is <span style={{ fontStyle: 'italic' }}>coming up</span>.
          </div>
          <div style={{ fontSize: 13, color: P.inkSoft, lineHeight: 1.45, fontWeight: 500 }}>
            Get clear on what you want, and how to land it.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{
            background: P.surface, borderRadius: 22, padding: 16, boxShadow: P.softShadow, minHeight: 108,
          }}>
            <div style={{ padding: '3px 8px', borderRadius: 100, background: P.warmSoft, color: P.warm, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'inline-block', marginBottom: 8 }}>Review</div>
            <div style={{ fontFamily: P.display, fontSize: 18, color: P.ink, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 4, fontStyle: 'italic' }}>Reflect</div>
            <div style={{ fontSize: 11, color: P.inkSoft, lineHeight: 1.4, fontWeight: 500 }}>A conversation just happened.</div>
          </div>
          <div style={{
            background: P.surface, borderRadius: 22, padding: 16, boxShadow: P.softShadow, minHeight: 108,
          }}>
            <div style={{ padding: '3px 8px', borderRadius: 100, background: P.chipBg, color: P.brandDeep, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'inline-block', marginBottom: 8 }}>Repair</div>
            <div style={{ fontFamily: P.display, fontSize: 18, color: P.ink, letterSpacing: -0.3, lineHeight: 1.2, marginBottom: 4, fontStyle: 'italic' }}>Mend</div>
            <div style={{ fontSize: 11, color: P.inkSoft, lineHeight: 1.4, fontWeight: 500 }}>Something went sideways.</div>
          </div>
        </div>

        {/* Active conversations */}
        <div style={{
          background: P.surface, borderRadius: 20, padding: '14px 16px',
          boxShadow: P.softShadow, marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Active conversations</div>
            <div style={{ fontSize: 11, color: P.brand, fontWeight: 700 }}>See all</div>
          </div>
          {[
            { name: 'Dad · boundaries', status: 'stabilizing', tone: P.warm },
            { name: 'Sam · rent split', status: 'open', tone: P.brand },
          ].map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', padding: '8px 0',
              borderTop: i > 0 ? `1px solid ${P.hair}` : 'none',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.tone, marginRight: 10 }}/>
              <div style={{ flex: 1, fontSize: 13, color: P.ink, fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 600 }}>{t.status}</div>
            </div>
          ))}
        </div>
      </div>

      <R_TabBar P={P} active="coach"/>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 2 · PREPARE — step 1, person picker
// ═══════════════════════════════════════════════════════════
function R_PrepPerson({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Prepare · 1 of 9" right={<R_StepDots P={P} current={0} total={9}/>}/>

      <div style={{ padding: '10px 22px 0', flex: 1 }}>
        <div style={{ fontFamily: P.display, fontSize: 28, color: P.ink, letterSpacing: -0.6, lineHeight: 1.12, marginBottom: 10 }}>
          Who is this <span style={{ fontStyle: 'italic' }}>with</span>?
        </div>
        <div style={{ fontSize: 14, color: P.inkSoft, lineHeight: 1.5, marginBottom: 22, fontWeight: 500 }}>
          Pick someone from your circle, or add new.
        </div>

        <div style={{ background: P.surface, borderRadius: 22, padding: 6, boxShadow: P.softShadow, marginBottom: 16 }}>
          {[
            { name: 'Dad', rel: 'Parent', init: 'D', tone: P.warmSoft, ink: P.warm },
            { name: 'Sam', rel: 'Roommate', init: 'S', tone: P.chipBg, ink: P.brandDeep },
            { name: 'Priya', rel: 'Manager', init: 'P', tone: P.bgHi, ink: P.brand },
            { name: 'Jules', rel: 'Partner', init: 'J', tone: P.warmSoft, ink: P.warm },
          ].map((p, i, arr) => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', padding: '10px 12px',
              borderRadius: 16, background: i === 0 ? P.chipBg : 'transparent',
              borderBottom: i < arr.length - 1 ? `1px solid ${P.hair}` : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: p.tone,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: p.ink, marginRight: 12,
              }}>{p.init}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: P.ink, fontWeight: 600, letterSpacing: -0.1 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: P.inkMuted, fontWeight: 500, marginTop: 1 }}>{p.rel}</div>
              </div>
              {i === 0 && (
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: P.brand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          padding: '12px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.6)',
          border: `1.5px dashed ${P.hair}`, textAlign: 'center', fontSize: 13, color: P.inkSoft, fontWeight: 600,
        }}>+ Add someone new</div>
      </div>

      <div style={{ padding: '14px 22px 28px' }}>
        <div style={{
          height: 54, borderRadius: 18, background: P.brand, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: `0 10px 24px ${P.brand}60`,
        }}>Continue</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 3 · PREPARE — mid-step · desired outcome textarea
// ═══════════════════════════════════════════════════════════
function R_PrepOutcome({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Prepare · 4 of 9" right={<R_StepDots P={P} current={3} total={9}/>}/>

      <div style={{ padding: '10px 22px 0', flex: 1 }}>
        <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
          Desired outcome
        </div>
        <div style={{ fontFamily: P.display, fontSize: 26, color: P.ink, letterSpacing: -0.6, lineHeight: 1.15, marginBottom: 8 }}>
          If this goes well,<br/>
          <span style={{ fontStyle: 'italic' }}>what's different</span> after?
        </div>
        <div style={{ fontSize: 13, color: P.inkSoft, lineHeight: 1.5, marginBottom: 20, fontWeight: 500 }}>
          One sentence. Specific, not "better."
        </div>

        <div style={{
          background: P.surface, borderRadius: 22, padding: '18px 18px 14px',
          boxShadow: P.cardShadow, minHeight: 180, marginBottom: 14, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 15.5, color: P.ink, lineHeight: 1.55, letterSpacing: -0.15, flex: 1 }}>
            He hears that I need him to stop commenting on what I eat at dinners<span style={{ color: P.brand, animation: 'caret 1.1s ease-in-out infinite' }}>|</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12, borderTop: `1px solid ${P.hair}`, marginTop: 8,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 100, background: P.chipBg,
            }}>
              <VoiceWaveform color={P.brand} bars={10}/>
              <div style={{ fontSize: 12, fontWeight: 700, color: P.brandDeep, fontVariantNumeric: 'tabular-nums' }}>0:12</div>
            </div>
            <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 600 }}>72 / 240</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Stuck? try
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['they feel heard', 'we agree on a next step', 'we both leave calm', 'I said the hard thing'].map(chip => (
            <div key={chip} style={{
              padding: '8px 14px', borderRadius: 100, background: P.surface,
              fontSize: 12, color: P.ink, fontWeight: 600, boxShadow: P.softShadow,
            }}>{chip}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 22px 28px' }}>
        <div style={{
          height: 54, borderRadius: 18, background: P.brand, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
          boxShadow: `0 10px 24px ${P.brand}60`,
        }}>Continue</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 4 · PREPARE — feedback card (AI coach output)
// ═══════════════════════════════════════════════════════════
function R_PrepFeedback({ P }) {
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Prepare · complete" right={<div style={{ width: 40 }}/>}/>

      <div style={{ padding: '8px 22px 0', flex: 1, overflow: 'auto' }}>
        <div style={{ fontFamily: P.display, fontSize: 28, color: P.ink, letterSpacing: -0.6, lineHeight: 1.12, marginBottom: 6 }}>
          Here's what <span style={{ fontStyle: 'italic' }}>might help</span>.
        </div>
        <div style={{ fontSize: 13, color: P.inkSoft, marginBottom: 20, fontWeight: 500 }}>
          Based on what you shared · for Dad
        </div>

        {/* Reality-check */}
        <div style={{
          background: P.surface, borderRadius: 22, padding: 18,
          boxShadow: P.cardShadow, marginBottom: 12, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: P.chipBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: P.brandDeep,
            }}>?</div>
            <div style={{ fontSize: 10, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Reality-check question</div>
          </div>
          <div style={{ fontFamily: P.display, fontSize: 19, color: P.ink, lineHeight: 1.25, letterSpacing: -0.3 }}>
            You assume he's <span style={{ fontStyle: 'italic' }}>criticizing</span>. What if he's <span style={{ fontStyle: 'italic' }}>worried</span>?
          </div>
        </div>

        {/* Don't do */}
        <div style={{
          background: P.surface, borderRadius: 22, padding: 18,
          boxShadow: P.cardShadow, marginBottom: 12, borderLeft: `3px solid ${P.danger}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, background: `${P.danger}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke={P.danger} strokeWidth="1.8" strokeLinecap="round"/></svg>
            </div>
            <div style={{ fontSize: 10, color: P.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>One thing not to do</div>
          </div>
          <div style={{ fontSize: 15, color: P.ink, lineHeight: 1.5, letterSpacing: -0.1, fontWeight: 500 }}>
            Don't open with "you always." It puts him on defense before you've even named what you want.
          </div>
        </div>

        {/* Best move */}
        <div style={{
          background: P.brand, color: '#fff', borderRadius: 22, padding: 18,
          boxShadow: `0 12px 28px ${P.brand}50`, marginBottom: 18, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1l1.5 3L11 4.5 8.5 7l.7 3.5L6 8.5 2.8 10.5 3.5 7 1 4.5 4.5 4z" fill="#fff"/></svg>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.85 }}>Best next move</div>
          </div>
          <div style={{ fontFamily: P.display, fontSize: 19, lineHeight: 1.3, letterSpacing: -0.3, marginBottom: 10 }}>
            Name what you need <span style={{ fontStyle: 'italic' }}>before</span> the dinner.
          </div>
          <div style={{ fontSize: 13.5, opacity: 0.92, lineHeight: 1.5, fontWeight: 500 }}>
            Try: "Dad, when I come over Sunday, can you skip comments on my plate? I want to be there without feeling watched."
          </div>
        </div>
      </div>

      <div style={{ padding: '4px 22px 28px', display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1, height: 52, borderRadius: 18, background: 'rgba(255,255,255,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: P.ink,
        }}>Save thread</div>
        <div style={{
          flex: 2, height: 52, borderRadius: 18, background: P.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
        }}>I'm ready →</div>
      </div>
    </R_Bg>
  );
}

// ═══════════════════════════════════════════════════════════
// 5 · THREADS — list of active conversations
// ═══════════════════════════════════════════════════════════
function R_Threads({ P }) {
  const rows = [
    { name: 'Dad · Sunday dinner boundary', date: '2d', status: 'stabilizing', count: 4, tone: P.warm },
    { name: 'Sam · rent split', date: '4d', status: 'open', count: 2, tone: P.brand },
    { name: 'Priya · scope pushback', date: '1w', status: 'resolved', count: 6, tone: P.inkMuted },
    { name: 'Jules · weekend plans', date: '2w', status: 'resolved', count: 3, tone: P.inkMuted },
  ];
  return (
    <R_Bg P={P} variant="deep">
      <R_TopBar P={P} title="Threads"/>

      <div style={{ padding: '0 22px 0', flex: 1 }}>
        <div style={{ fontFamily: P.display, fontSize: 30, color: P.ink, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 22 }}>
          Conversations in <span style={{ fontStyle: 'italic' }}>motion</span>.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['All', 'Open', 'Stabilizing', 'Resolved'].map((t, i) => (
            <div key={t} style={{
              padding: '6px 14px', borderRadius: 100,
              background: i === 0 ? P.ink : P.surface, color: i === 0 ? '#fff' : P.inkSoft,
              fontSize: 12, fontWeight: 700, boxShadow: i === 0 ? 'none' : P.softShadow,
            }}>{t}</div>
          ))}
        </div>

        <div style={{ background: P.surface, borderRadius: 22, boxShadow: P.cardShadow }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', padding: '14px 16px',
              borderTop: i > 0 ? `1px solid ${P.hair}` : 'none',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.tone, marginRight: 12 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: P.ink, fontWeight: 700, letterSpacing: -0.1, marginBottom: 2 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 500 }}>
                  {r.count} entries · {r.status}
                </div>
              </div>
              <div style={{ fontSize: 11, color: P.inkMuted, fontWeight: 600 }}>{r.date}</div>
            </div>
          ))}
        </div>
      </div>

      <R_TabBar P={P} active="coach"/>
    </R_Bg>
  );
}

Object.assign(window, { R_CoachHub, R_PrepPerson, R_PrepOutcome, R_PrepFeedback, R_Threads });
