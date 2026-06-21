import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapCanvas } from './components/map/MapCanvas'
import { useStore } from './store/useStore'
import type { Level } from './store/useStore'
import {
  Search, X, MapPin, GraduationCap, Navigation,
  Sun, Moon, ArrowUpDown, Layers, Clock, Route,
  ChevronRight, AlertTriangle, Footprints
} from 'lucide-react'

const StairsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
    fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 20H13V15H8V10H3V4" />
  </svg>
)

function haversine(c1: [number, number], c2: [number, number]) {
  const R = 6371e3
  const dLat = (c2[1] - c1[1]) * Math.PI / 180
  const dLon = (c2[0] - c1[0]) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(c1[1] * Math.PI / 180) * Math.cos(c2[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const POI_COLORS: Record<string, { bg: string; glow: string }> = {
  transit:   { bg: '#10b981', glow: 'rgba(16,185,129,0.3)' },
  classroom: { bg: '#6366f1', glow: 'rgba(99,102,241,0.3)' },
  default:   { bg: '#f43f5e', glow: 'rgba(244,63,94,0.3)'  },
}
function poiColor(type: string, category?: string) {
  if (type === 'transit') return POI_COLORS.transit
  if (category === 'classroom') return POI_COLORS.classroom
  return POI_COLORS.default
}

// ─── Glass style factories (always inline — never Tailwind) ───────
function glassStyle(dark: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background:       dark ? 'rgba(28,28,30,0.82)' : 'rgba(255,255,255,0.78)',
    backdropFilter:   'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border:           `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)'}`,
    boxShadow:        dark
      ? '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)'
      : '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.80)',
    borderRadius: 20,
    ...extra,
  }
}

function pillHoverBg(dark: boolean, active: boolean) {
  if (active) return '#2563eb'
  return dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'
}

// ─── Small reusable icon-box ──────────────────────────────────────
function IconBox({ bg, glow, children }: { bg: string; glow: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10,
      background: bg, boxShadow: `0 2px 8px ${glow}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', flexShrink: 0,
    }}>
      {children}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────
function Divider({ dark, vertical }: { dark: boolean; vertical?: boolean }) {
  return (
    <div style={{
      [vertical ? 'width' : 'height']: 1,
      [vertical ? 'height' : 'width']: vertical ? 24 : '100%',
      background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      flexShrink: 0,
    }} />
  )
}

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const {
    activeLevel, setActiveLevel,
    features, isLoading,
    route, setDestination, setOrigin, setRawOrigin, clearRoute,
    isAdminMode,
  } = useStore()

  // ── Theme ────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const text  = isDark ? '#f5f5f7' : '#1d1d1f'
  const sub   = isDark ? '#aeaeb2' : '#6e6e73'
  const faint = isDark ? '#6e6e73' : '#aeaeb2'
  const hov   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'

  // ── Search state ─────────────────────────────────────────────────
  const [destQuery,   setDestQuery]   = useState('')
  const [destOpen,    setDestOpen]    = useState(false)
  const [destIdx,     setDestIdx]     = useState(-1)
  const [originQuery, setOriginQuery] = useState('')
  const [originOpen,  setOriginOpen]  = useState(false)
  const [originIdx,   setOriginIdx]   = useState(-1)
  const [pickMode,    setPickMode]    = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  // ── Sync labels ──────────────────────────────────────────────────
  useEffect(() => {
    if (!route.destination) { setDestQuery(''); return }
    const f = features.find(f => f.properties?._feature_id === route.destination)
    if (f) setDestQuery(f.properties?.name || '')
  }, [route.destination, features])

  useEffect(() => {
    if (!route.rawOrigin && !route.origin) setOriginQuery('')
  }, [route.rawOrigin, route.origin])

  // ── Click-outside close ──────────────────────────────────────────
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDestOpen(false); setOriginOpen(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── POI lists ────────────────────────────────────────────────────
  const pois = useMemo(() =>
    features.filter(f => f.properties?.type === 'poi')
      .sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || '')),
    [features]
  )
  const points = useMemo(() =>
    features.filter(f => f.geometry?.type === 'Point' &&
      (f.properties?.type === 'poi' || f.properties?.type === 'transit'))
      .sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || '')),
    [features]
  )
  const filteredDest   = pois.filter(p => (p.properties?.name || '').toLowerCase().includes(destQuery.toLowerCase()))
  const filteredOrigin = points.filter(p => (p.properties?.name || '').toLowerCase().includes(originQuery.toLowerCase())).slice(0, 8)

  // ── Map pick origin ──────────────────────────────────────────────
  const onMapPick = useCallback((e: Event) => {
    const { lng, lat, level } = (e as CustomEvent).detail as { lng: number; lat: number; level: Level }
    setRawOrigin([lng, lat])
    setOrigin([lng, lat], level)
    setOriginQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    setPickMode(false)
  }, [setRawOrigin, setOrigin])

  useEffect(() => {
    document.addEventListener('map:pick-origin', onMapPick)
    return () => document.removeEventListener('map:pick-origin', onMapPick)
  }, [onMapPick])

  // ── Route stats ──────────────────────────────────────────────────
  const routeStats = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length < 2) return null
    let distM = 0
    for (let i = 1; i < route.routeCoordinates.length; i++) {
      distM += haversine(
        [route.routeCoordinates[i - 1][0], route.routeCoordinates[i - 1][1]],
        [route.routeCoordinates[i][0], route.routeCoordinates[i][1]]
      )
    }
    const mins    = Math.max(1, Math.ceil(distM / 1.2 / 60))
    const distStr = distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`
    const transitions: Array<{ from: number; to: number }> = []
    for (let i = 1; i < route.routeCoordinates.length; i++) {
      const prev = route.routeCoordinates[i - 1][2], curr = route.routeCoordinates[i][2]
      if (curr !== prev && !transitions.find(t => t.from === prev && t.to === curr))
        transitions.push({ from: prev, to: curr })
    }
    const destFeature = features.find(f => f.properties?._feature_id === route.destination)
    return { distStr, mins, transitions, destName: destFeature?.properties?.name || '' }
  }, [route.routeCoordinates, route.destination, features])

  const hasRoute  = !!(route.destination && route.routeCoordinates.length > 0)
  const hasOrigin = !!(route.rawOrigin || route.origin)

  // ── Keyboard nav helpers ─────────────────────────────────────────
  const onDestKey = (e: React.KeyboardEvent) => {
    if (!destOpen || !filteredDest.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setDestIdx(i => Math.min(i + 1, filteredDest.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setDestIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && destIdx >= 0) selectDest(filteredDest[destIdx])
    if (e.key === 'Escape') { setDestOpen(false); setDestIdx(-1) }
  }
  const onOriginKey = (e: React.KeyboardEvent) => {
    if (!originOpen || !filteredOrigin.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOriginIdx(i => Math.min(i + 1, filteredOrigin.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setOriginIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && originIdx >= 0) selectOrigin(filteredOrigin[originIdx])
    if (e.key === 'Escape') { setOriginOpen(false); setOriginIdx(-1) }
  }
  const selectDest = (poi: any) => {
    setDestination(poi.properties._feature_id)
    setDestQuery(poi.properties.name)
    setDestOpen(false); setDestIdx(-1)
  }
  const selectOrigin = (p: any) => {
    const [lng, lat] = p.geometry.coordinates
    const level = (p.properties?.level || activeLevel) as Level
    setRawOrigin([lng, lat]); setOrigin([lng, lat], level)
    setOriginQuery(p.properties.name)
    setOriginOpen(false); setOriginIdx(-1)
  }

  // ── Dropdown item renderer ───────────────────────────────────────
  const DropItem = ({
    name, sub: subtitle, type, category, transitType,
    isActive, onClick, onHover,
  }: {
    name: string; sub: string; type: string; category?: string; transitType?: string
    isActive: boolean; onClick: () => void; onHover: () => void
  }) => {
    const c = poiColor(type, category)
    return (
      <button
        onMouseEnter={onHover}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 12, width: '100%',
          textAlign: 'left', cursor: 'pointer', border: 'none',
          background: isActive ? (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(37,99,235,0.07)') : 'transparent',
          transition: 'background 0.12s ease',
        }}>
        <IconBox bg={c.bg} glow={c.glow}>
          {type === 'transit'
            ? transitType === 'staircase' ? <StairsIcon /> : <ArrowUpDown size={14} />
            : category === 'classroom' ? <GraduationCap size={14} /> : <MapPin size={14} />}
        </IconBox>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 10, fontWeight: 500, color: sub, marginTop: 1 }}>{subtitle}</div>
        </div>
        <ChevronRight size={14} color={faint} style={{ flexShrink: 0 }} />
      </button>
    )
  }

  // ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', userSelect: 'none', background: isDark ? '#000' : '#f0f0f2' }}>

      {/* Full-bleed map */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapCanvas isDark={isDark} pickingFromMap={pickMode} />
      </div>

      {/* ── Admin banner ──────────────────────────────────────────── */}
      {isAdminMode && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '8px 16px', background: 'rgba(251,146,60,0.93)',
          backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(251,146,60,0.4)',
        }}>
          <AlertTriangle size={14} color="#7c2d12" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7c2d12' }}>
            Admin Mode — not for public use
          </span>
        </div>
      )}

      {/* ═══ SEARCH PANEL ══════════════════════════════════════════ */}
      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          top: isAdminMode ? 52 : 16,
          left: 16,
          width: 'min(340px, calc(100vw - 80px))',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>

        {/* Glass card */}
        <div style={glassStyle(isDark, { padding: '8px 6px 6px' })}>

          {/* Brand header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 8px' }}>
            <div style={{
              width: 24, height: 24, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Footprints size={12} color="#fff" />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: faint }}>
              NSU Wayfinder
            </span>
          </div>

          {/* ── Origin input row ───────────────────────────────────── */}
          <div style={{ position: 'relative' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 10px 10px 12px', borderRadius: 14,
              background: originOpen ? hov : 'transparent',
              transition: 'background 0.15s ease',
            }}>
              {/* Blue dot */}
              <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#2563eb', border: '2.5px solid #fff', boxShadow: '0 2px 6px rgba(37,99,235,0.4)', zIndex: 1 }} />
                {pickMode && (
                  <div style={{ position: 'absolute', width: 26, height: 26, borderRadius: '50%', background: 'rgba(37,99,235,0.25)', animation: 'glow-ping 1.6s ease infinite' }} />
                )}
              </div>

              <input
                type="text"
                placeholder={pickMode ? 'Tap the map to set start…' : 'Your starting point'}
                value={originQuery}
                onChange={e => { setOriginQuery(e.target.value); setOriginOpen(true); setPickMode(false) }}
                onFocus={() => { if (!pickMode) setOriginOpen(true) }}
                onKeyDown={onOriginKey}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                  fontFamily: 'inherit',
                }}
              />

              {/* Pick-from-map button */}
              <button
                title={pickMode ? 'Cancel' : 'Pick location from map'}
                onClick={() => { setPickMode(p => !p); setOriginOpen(false) }}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pickMode ? '#2563eb' : hov,
                  color: pickMode ? '#fff' : sub,
                  border: 'none', cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.34,1.26,0.64,1)',
                }}>
                <Navigation size={15} />
              </button>

              {/* Clear origin */}
              {hasOrigin && !pickMode && (
                <button
                  onClick={() => { setRawOrigin(null); setOrigin(null); setOriginQuery('') }}
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hov, color: sub, border: 'none', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Origin dropdown */}
            {originOpen && filteredOrigin.length > 0 && (
              <div style={{
                ...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: 220, overflowY: 'auto' }),
                animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
              }}>
                {filteredOrigin.map((p, i) => (
                  <DropItem key={p.properties?._feature_id || i}
                    name={p.properties?.name || ''}
                    sub={`${p.properties?.building || p.properties?.type} · Level ${p.properties?.level}`}
                    type={p.properties?.type} category={p.properties?.category} transitType={p.properties?.transit_type}
                    isActive={originIdx === i}
                    onHover={() => setOriginIdx(i)}
                    onClick={() => selectOrigin(p)} />
                ))}
              </div>
            )}
          </div>

          {/* Connector dots */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)' }} />
              ))}
            </div>
          </div>

          {/* ── Destination input row ─────────────────────────────── */}
          <div style={{ position: 'relative' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 10px 10px 12px', borderRadius: 14,
              background: destOpen ? hov : 'transparent',
              transition: 'background 0.15s ease',
            }}>
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Search size={17} color={sub} />
              </div>
              <input
                type="text"
                placeholder="Where do you want to go?"
                value={destQuery}
                onChange={e => { setDestQuery(e.target.value); setDestOpen(true); setDestIdx(-1) }}
                onFocus={() => setDestOpen(true)}
                onKeyDown={onDestKey}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                  fontFamily: 'inherit',
                }}
              />
              {(destQuery || route.destination) && (
                <button
                  onClick={() => { clearRoute(); setDestQuery(''); setDestOpen(false); setDestIdx(-1) }}
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hov, color: sub, border: 'none', cursor: 'pointer',
                  }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Destination dropdown */}
            {destOpen && filteredDest.length > 0 && (
              <div style={{
                ...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: 264, overflowY: 'auto' }),
                animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
              }}>
                {filteredDest.map((poi, i) => (
                  <DropItem key={poi.properties?._feature_id}
                    name={poi.properties?.name || ''}
                    sub={`${poi.properties?.building} · Level ${poi.properties?.level}`}
                    type={poi.properties?.type} category={poi.properties?.category}
                    isActive={destIdx === i}
                    onHover={() => setDestIdx(i)}
                    onClick={() => selectDest(poi)} />
                ))}
              </div>
            )}
          </div>

          {/* Bottom inner spacing */}
          <div style={{ height: 2 }} />
        </div>

        {/* Loading badge */}
        {isLoading && (
          <div style={glassStyle(isDark, { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', alignSelf: 'flex-start' })}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'glow-ping 1.2s ease infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: sub }}>Loading floor plan…</span>
          </div>
        )}
      </div>

      {/* ═══ RIGHT RAIL — theme toggle + floor pill ════════════════ */}
      <div style={{
        position: 'absolute',
        top: isAdminMode ? 60 : 16,
        right: 16,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}>

        {/* Dark / light toggle */}
        <button
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setIsDark(d => !d)}
          style={{
            ...glassStyle(isDark),
            width: 46, height: 46, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: 'none',
            color: isDark ? '#fbbf24' : '#6e6e73',
            transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
          }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Floor selector pill */}
        <div style={glassStyle(isDark, {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 6px', gap: 4,
        })}>
          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
            <Layers size={12} color={faint} />
          </div>

          {/* Floor 2 button */}
          {([2, 1] as Level[]).map(lvl => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              style={{
                width: 46, height: 46, borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, cursor: 'pointer', border: 'none',
                background: activeLevel === lvl ? '#2563eb' : 'transparent',
                color: activeLevel === lvl ? '#ffffff' : sub,
                boxShadow: activeLevel === lvl ? '0 3px 14px rgba(37,99,235,0.45)' : 'none',
                transform: activeLevel === lvl ? 'scale(1.06)' : 'scale(1)',
                transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
                fontFamily: 'inherit',
              }}>
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{lvl === 1 ? 'G' : '2'}</span>
              <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75, lineHeight: 1 }}>FLOOR</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ BOTTOM ROUTE SHEET ════════════════════════════════════ */}
      {hasRoute && routeStats && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
          display: 'flex', justifyContent: 'center',
          padding: '8px 16px 24px',
          pointerEvents: 'none',
        }}>
          <div style={{
            ...glassStyle(isDark, {
              width: '100%', maxWidth: 420,
              animation: 'sheet-up 0.42s cubic-bezier(0.16,1,0.3,1) forwards',
              pointerEvents: 'all',
              padding: 0,
            }),
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)' }} />
            </div>

            {/* Destination header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px 14px' }}>
              <div style={{
                width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}>
                <Route size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: faint, marginBottom: 2 }}>
                  Navigating to
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {routeStats.destName}
                </div>
              </div>
              <button
                onClick={() => { clearRoute(); setDestQuery('') }}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: hov, color: sub, border: 'none', cursor: 'pointer',
                }}>
                <X size={15} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', margin: '0 18px' }} />

            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'stretch', padding: '14px 18px', gap: 16 }}>
              {/* Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={17} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: text, lineHeight: 1 }}>
                    {routeStats.mins}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3 }}>min</span>
                  </div>
                  <div style={{ fontSize: 10, color: faint, marginTop: 2 }}>walking</div>
                </div>
              </div>

              <div style={{ width: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }} />

              {/* Distance */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Footprints size={17} color="#10b981" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: text, lineHeight: 1 }}>{routeStats.distStr}</div>
                  <div style={{ fontSize: 10, color: faint, marginTop: 2 }}>distance</div>
                </div>
              </div>
            </div>

            {/* Floor change hint */}
            {routeStats.transitions.length > 0 && (
              <>
                <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', margin: '0 18px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowUpDown size={17} color="#8b5cf6" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: text }}>
                    Take a lift or stairs to{' '}
                    {routeStats.transitions.map((t, i) => (
                      <strong key={i} style={{ color: '#8b5cf6' }}>
                        {i > 0 ? ', then ' : ''}Floor {t.to}
                      </strong>
                    ))}
                  </span>
                </div>
              </>
            )}

            {/* Safe-area bottom padding for phones */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)', minHeight: 4 }} />
          </div>
        </div>
      )}
    </div>
  )
}
