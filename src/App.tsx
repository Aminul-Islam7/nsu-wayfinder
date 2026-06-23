import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapCanvas } from './components/map/MapCanvas'
import { useStore } from './store/useStore'
import type { Level } from './store/useStore'
import { useDeviceOrientation } from './hooks/useDeviceOrientation'
import { useDeadReckoning } from './hooks/useDeadReckoning'
import { useGeolocation } from './hooks/useGeolocation'
import {
  Search, X, MapPin, GraduationCap, Navigation,
  Sun, Moon, ArrowUpDown, Layers, Clock, Route,
  ChevronRight, AlertTriangle, Footprints, Radio
} from 'lucide-react'
import { nearestPointOnLine, point } from '@turf/turf'

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

// ─── Responsive hook ──────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 520)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 520)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const {
    activeLevel, setActiveLevel,
    features, isLoading,
    route, setDestination, setOrigin, setRawOrigin, clearRoute, setRouteCoordinates,
    isAdminMode,
    trackingEnabled, setTrackingEnabled,
    gpsActive, setGpsActive,
  } = useStore()

  const isMobile = useIsMobile()

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
  const [pickMode,    setPickMode]    = useState<'origin' | 'dest' | false>(false)

  const panelRef = useRef<HTMLDivElement>(null)

  // ── Compass / orientation ─────────────────────────────────────────
  const { heading, hasCompass, permissionGranted: compassGranted, requestPermission: reqCompass } = useDeviceOrientation()

  // ── GPS tracking ─────────────────────────────────────────────────
  // Last GPS fix accuracy — prefer GPS when accuracy < 30m, else dead reckon
  const gpsAccRef = useRef<number>(Infinity)

  const handleGpsPosition = useCallback((lng: number, lat: number, accuracy: number) => {
    gpsAccRef.current = accuracy
    const isGoodFix = accuracy < 50
    setGpsActive(isGoodFix)

    if (isGoodFix) {
      // Snap to nearest path and update origin
      setRawOrigin([lng, lat])
      const originLvl = (route.originLevel ?? activeLevel) as Level
      const levelPaths = features.filter(
        f => f.geometry && f.properties?.type === 'path' && f.properties?.level === originLvl
      )
      if (levelPaths.length > 0) {
        try {
          const pt = point([lng, lat])
          let minDist = Infinity
          let snapped: [number, number] | null = null
          for (const pf of levelPaths) {
            const s = nearestPointOnLine(pf, pt)
            const d = s.properties?.dist ?? Infinity
            if (d < minDist) { minDist = d; snapped = s.geometry.coordinates as [number, number] }
          }
          if (snapped) setOrigin(snapped, originLvl)
        } catch { /* ignore snap error */ }
      } else {
        setOrigin([lng, lat], originLvl)
      }
    }
  }, [features, activeLevel, route.originLevel, setGpsActive, setRawOrigin, setOrigin])

  useGeolocation({ enabled: trackingEnabled, onPosition: handleGpsPosition })

  // ── Dead reckoning (kicks in when GPS unavailable / indoors) ─────
  const currentPos = route.rawOrigin ?? route.origin ?? null

  const handleDrPosition = useCallback((lng: number, lat: number) => {
    // Only use dead reckoning when GPS is poor
    if (gpsAccRef.current < 50) return
    setGpsActive(false)
    setRawOrigin([lng, lat])
    const originLvl = (route.originLevel ?? activeLevel) as Level
    const levelPaths = features.filter(
      f => f.geometry && f.properties?.type === 'path' && f.properties?.level === originLvl
    )
    if (levelPaths.length > 0) {
      try {
        const pt = point([lng, lat])
        let minDist = Infinity
        let snapped: [number, number] | null = null
        for (const pf of levelPaths) {
          const s = nearestPointOnLine(pf, pt)
          const d = s.properties?.dist ?? Infinity
          if (d < minDist) { minDist = d; snapped = s.geometry.coordinates as [number, number] }
        }
        if (snapped) setOrigin(snapped, originLvl)
      } catch { /* ignore */ }
    } else {
      setOrigin([lng, lat], originLvl)
    }
  }, [gpsAccRef, features, activeLevel, route.originLevel, setGpsActive, setRawOrigin, setOrigin])

  useDeadReckoning({
    enabled: trackingEnabled && !gpsActive,
    heading,
    onPositionUpdate: handleDrPosition,
    initialPosition: currentPos,
  })

  // ── Auto-request iOS orientation permission on first interaction ─
  useEffect(() => {
    if (!compassGranted) {
      const fn = () => { reqCompass(); document.removeEventListener('touchstart', fn) }
      document.addEventListener('touchstart', fn, { once: true })
      return () => document.removeEventListener('touchstart', fn)
    }
  }, [compassGranted, reqCompass])

  // ── Sync labels ──────────────────────────────────────────────────
  useEffect(() => {
    if (!route.destination) { setDestQuery(''); return }
    if (route.destination.startsWith('coord:')) return
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

  // ── Sync URL -> Store state on initial load ─────────────────────
  const urlLoadedRef = useRef(false)
  useEffect(() => {
    if (isLoading || features.length === 0 || urlLoadedRef.current) return
    urlLoadedRef.current = true

    const params = new URLSearchParams(window.location.search)
    const startParam = params.get('start')
    const destParam = params.get('dest')

    // Support legacy params (lat, lng, level) as fallback
    const latParam = params.get('lat')
    const lngParam = params.get('lng') || params.get('lon') || params.get('longitude')
    const levelParam = params.get('level')

    if (startParam) {
      if (startParam.startsWith('coord:')) {
        const parts = startParam.replace('coord:', '').split(',')
        if (parts.length >= 3) {
          const lng = parseFloat(parts[0])
          const lat = parseFloat(parts[1])
          const lvl = parseInt(parts[2]) as Level
          setRawOrigin([lng, lat])
          setOrigin([lng, lat], lvl)
          setOriginQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setActiveLevel(lvl)
        }
      } else {
        const p = features.find(f => f.properties?._feature_id === startParam)
        if (p && p.geometry?.coordinates) {
          const [lng, lat] = p.geometry.coordinates
          const lvl = (p.properties?.level || 1) as Level
          setRawOrigin([lng, lat])
          setOrigin([lng, lat], lvl)
          setOriginQuery(p.properties?.name || '')
          setActiveLevel(lvl)
        }
      }
    } else if (latParam && lngParam) {
      const rawLat = parseFloat(latParam)
      const rawLng = parseFloat(lngParam)
      const rawLevel = levelParam ? (parseInt(levelParam) as Level) : (1 as Level)
      setRawOrigin([rawLng, rawLat])
      setOrigin([rawLng, rawLat], rawLevel)
      setOriginQuery(`${rawLat.toFixed(5)}, ${rawLng.toFixed(5)}`)
      setActiveLevel(rawLevel)
    }

    if (destParam) {
      if (destParam.startsWith('coord:')) {
        const parts = destParam.replace('coord:', '').split(',')
        if (parts.length >= 3) {
          const lng = parseFloat(parts[0])
          const lat = parseFloat(parts[1])
          setDestination(destParam)
          setDestQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setActiveLevel(parseInt(parts[2]) as Level)
        }
      } else {
        const p = features.find(f => f.properties?._feature_id === destParam)
        if (p) {
          setDestination(destParam)
          setDestQuery(p.properties?.name || '')
          setActiveLevel((p.properties?.level || 1) as Level)
        }
      }
    }
  }, [isLoading, features, setRawOrigin, setOrigin, setDestination, setActiveLevel])

  // ── Sync Store state -> URL ──────────────────────────────────────
  useEffect(() => {
    if (isLoading || features.length === 0 || !urlLoadedRef.current) return
    const params = new URLSearchParams(window.location.search)

    if (route.rawOrigin) {
      const matchedPoi = features.find(
        f => f.geometry?.type === 'Point' &&
        f.geometry.coordinates[0] === route.rawOrigin![0] &&
        f.geometry.coordinates[1] === route.rawOrigin![1] &&
        f.properties?.level === route.originLevel
      )
      if (matchedPoi) {
        params.set('start', matchedPoi.properties?._feature_id)
      } else {
        params.set('start', `coord:${route.rawOrigin[0]},${route.rawOrigin[1]},${route.originLevel || activeLevel}`)
      }
      params.delete('lat')
      params.delete('lng')
      params.delete('lon')
      params.delete('longitude')
      params.delete('level')
    } else {
      params.delete('start')
    }

    if (route.destination) {
      params.set('dest', route.destination)
    } else {
      params.delete('dest')
    }

    const newSearch = params.toString()
    const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`
    if (window.location.search !== `?${newSearch}`) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [route.rawOrigin, route.originLevel, route.destination, features, activeLevel, isLoading])

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
    if (!pickMode) return
    let { lng, lat, level, featureId, name } = (e as CustomEvent).detail as { lng: number; lat: number; level: Level; featureId?: string; name?: string }

    // Snap to nearest POI if click is very close (under 2.5m)
    if (!featureId) {
      const levelPois = features.filter(
        f => f.geometry?.type === 'Point' &&
        (f.properties?.type === 'poi' || f.properties?.type === 'transit') &&
        f.properties?.level === level
      )
      let minDistance = Infinity
      let closestPoi: any = null
      for (const poi of levelPois) {
        const d = haversine([lng, lat], poi.geometry.coordinates as [number, number])
        if (d < minDistance) {
          minDistance = d
          closestPoi = poi
        }
      }
      if (closestPoi && minDistance < 2.5) {
        featureId = closestPoi.properties?._feature_id || closestPoi.properties?.node_id
        name = closestPoi.properties?.name || 'POI'
        lng = closestPoi.geometry.coordinates[0]
        lat = closestPoi.geometry.coordinates[1]
      }
    }

    if (pickMode === 'origin') {
      setRawOrigin([lng, lat])
      setOrigin([lng, lat], level)
      setOriginQuery(featureId ? (name || '') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    } else if (pickMode === 'dest') {
      if (featureId) {
        setDestination(featureId)
        setDestQuery(name || '')
      } else {
        setDestination(`coord:${lng},${lat},${level}`)
        setDestQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      }
    }
    setPickMode(false)
  }, [pickMode, features, setRawOrigin, setOrigin, setDestination, setDestQuery])

  useEffect(() => {
    document.addEventListener('map:pick-origin', onMapPick)
    return () => document.removeEventListener('map:pick-origin', onMapPick)
  }, [onMapPick])

  // ── Route stats ──────────────────────────────────────────────────
  const routeStats = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length < 2) return null

    // Core path distance
    let distM = 0
    for (let i = 1; i < route.routeCoordinates.length; i++) {
      distM += haversine(
        [route.routeCoordinates[i - 1][0], route.routeCoordinates[i - 1][1]],
        [route.routeCoordinates[i][0], route.routeCoordinates[i][1]]
      )
    }

    // Add YOU marker → snapped path start distance
    const youCoords = route.rawOrigin || route.origin
    if (youCoords) {
      const firstCoord = route.routeCoordinates[0]
      distM += haversine(youCoords as [number, number], [firstCoord[0], firstCoord[1]])
    }

    // Add last route node → destination POI distance
    let destCoords: [number, number] | null = null
    let destName = ''
    if (route.destination?.startsWith('coord:')) {
      const parts = route.destination.replace('coord:', '').split(',')
      destCoords = [parseFloat(parts[0]), parseFloat(parts[1])]
      destName = 'Destination'
    } else {
      const destFeature = features.find(f => f.properties?._feature_id === route.destination)
      if (destFeature?.geometry?.type === 'Point') {
        destCoords = destFeature.geometry.coordinates as [number, number]
        destName = destFeature.properties?.name || ''
      }
    }

    if (destCoords) {
      const lastCoord = route.routeCoordinates[route.routeCoordinates.length - 1]
      distM += haversine([lastCoord[0], lastCoord[1]], destCoords)
    }

    const totalSeconds = Math.round(distM / 1.2)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    
    const distStr = distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`

    const transitions: Array<{ from: number; to: number }> = []
    for (let i = 1; i < route.routeCoordinates.length; i++) {
      const prev = route.routeCoordinates[i - 1][2], curr = route.routeCoordinates[i][2]
      if (curr !== prev && !transitions.find(t => t.from === prev && t.to === curr))
        transitions.push({ from: prev, to: curr })
    }

    return { distStr, mins, secs, transitions, destName }
  }, [route.routeCoordinates, route.rawOrigin, route.origin, route.destination, features])

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
    const c = type === 'pick-map' ? { bg: '#3b82f6', glow: 'rgba(59,130,246,0.3)' } : poiColor(type, category)
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
          {type === 'pick-map' ? <MapPin size={14} />
            : type === 'transit'
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

  // ── Responsive layout values ─────────────────────────────────────
  const adminOffset   = isAdminMode ? (isMobile ? 40 : 52) : 0
  const searchTop     = 16 + adminOffset
  // On mobile: panel goes full-width with 12px margins on each side
  const searchLeft    = isMobile ? 12 : 16
  const searchWidth   = isMobile ? 'calc(100vw - 24px)' : 'min(340px, calc(100vw - 80px))'
  // Right rail: on mobile push it to bottom-right above route sheet
  const railRight     = 12
  const railTop       = isMobile ? undefined : (16 + adminOffset)
  const railBottom    = isMobile ? (hasRoute ? 180 : 24) : undefined

  // ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100svh', overflow: 'hidden', userSelect: 'none', background: isDark ? '#000' : '#f0f0f2' }}>

      {/* Full-bleed map */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapCanvas
          isDark={isDark}
          pickingFromMap={pickMode}
          heading={hasCompass ? heading : null}
          gpsActive={gpsActive}
          trackingEnabled={trackingEnabled}
        />
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
          top: searchTop,
          left: searchLeft,
          width: searchWidth,
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

            {/* Tracking pill — right-aligned */}
            <div style={{ marginLeft: 'auto' }}>
              <button
                title={trackingEnabled ? (gpsActive ? 'GPS active' : 'Sensor tracking (GPS unavailable)') : 'Start location tracking'}
                onClick={() => setTrackingEnabled(!trackingEnabled)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 8px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: trackingEnabled
                    ? (gpsActive ? 'rgba(16,185,129,0.15)' : 'rgba(37,99,235,0.12)')
                    : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                  transition: 'all 0.2s ease',
                }}>
                <Radio
                  size={11}
                  color={trackingEnabled ? (gpsActive ? '#10b981' : '#2563eb') : faint}
                  style={{ animation: trackingEnabled ? 'glow-ping 2s ease infinite' : 'none' }}
                />
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: trackingEnabled ? (gpsActive ? '#10b981' : '#2563eb') : faint,
                }}>
                  {trackingEnabled ? (gpsActive ? 'GPS' : 'Sensor') : 'Tracking off'}
                </span>
              </button>
            </div>
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
                placeholder={pickMode === 'origin' ? 'Tap the map to set start…' : 'Your starting point'}
                value={originQuery}
                onChange={e => { setOriginQuery(e.target.value); setOriginOpen(true); setDestOpen(false); setPickMode(false) }}
                onFocus={() => { if (pickMode !== 'origin') { setOriginOpen(true); setDestOpen(false); } }}
                onKeyDown={onOriginKey}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                  fontFamily: 'inherit',
                }}
              />

              {/* Pick-from-map button */}
              <button
                title={pickMode === 'origin' ? 'Cancel' : 'Pick location from map'}
                onClick={() => { setPickMode(p => p === 'origin' ? false : 'origin'); setOriginOpen(false) }}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pickMode === 'origin' ? '#2563eb' : hov,
                  color: pickMode === 'origin' ? '#fff' : sub,
                  border: 'none', cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.34,1.26,0.64,1)',
                }}>
                <MapPin size={15} />
              </button>

              {/* Clear origin */}
              {hasOrigin && pickMode !== 'origin' && (
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
            {originOpen && (
              <div style={{
                ...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: isMobile ? 180 : 220, overflowY: 'auto' }),
                animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
              }}>
                <DropItem
                  name="Pick location from map"
                  sub="Tap the map to set starting point"
                  type="pick-map"
                  isActive={originIdx === -1}
                  onHover={() => setOriginIdx(-1)}
                  onClick={() => { setPickMode('origin'); setOriginOpen(false); }}
                />
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
                placeholder={pickMode === 'dest' ? 'Tap the map to set destination…' : 'Where do you want to go?'}
                value={destQuery}
                onChange={e => { setDestQuery(e.target.value); setDestOpen(true); setOriginOpen(false); setDestIdx(-1); setPickMode(false) }}
                onFocus={() => { if (pickMode !== 'dest') { setDestOpen(true); setOriginOpen(false); } }}
                onKeyDown={onDestKey}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                  fontFamily: 'inherit',
                }}
              />
              {/* Pick-from-map button for dest */}
              <button
                title={pickMode === 'dest' ? 'Cancel' : 'Pick location from map'}
                onClick={() => { setPickMode(p => p === 'dest' ? false : 'dest'); setDestOpen(false) }}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pickMode === 'dest' ? '#2563eb' : hov,
                  color: pickMode === 'dest' ? '#fff' : sub,
                  border: 'none', cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.34,1.26,0.64,1)',
                }}>
                <MapPin size={15} />
              </button>
              {(destQuery || route.destination) && pickMode !== 'dest' && (
                <button
                  onClick={() => { setDestination(null); setRouteCoordinates([]); setDestQuery(''); setDestOpen(false); setDestIdx(-1) }}
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
            {destOpen && (
              <div style={{
                ...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: isMobile ? 200 : 264, overflowY: 'auto' }),
                animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
              }}>
                <DropItem
                  name="Pick location from map"
                  sub="Tap the map to set destination point"
                  type="pick-map"
                  isActive={destIdx === -1}
                  onHover={() => setDestIdx(-1)}
                  onClick={() => { setPickMode('dest'); setDestOpen(false); }}
                />
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

      {/* ═══ RIGHT RAIL — theme toggle + level pill ════════════════ */}
      <div style={{
        position: 'absolute',
        top: railTop,
        bottom: railBottom,
        right: railRight,
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
            width: isMobile ? 48 : 46, height: isMobile ? 48 : 46, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: 'none',
            color: isDark ? '#fbbf24' : '#6e6e73',
            transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
          }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Level selector pill */}
        <div style={glassStyle(isDark, {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 6px', gap: 4,
        })}>
          {/* Label icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
            <Layers size={12} color={faint} />
          </div>

          {([2, 1] as Level[]).map(lvl => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              style={{
                width: isMobile ? 48 : 46, height: isMobile ? 48 : 46, borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, cursor: 'pointer', border: 'none',
                background: activeLevel === lvl ? '#2563eb' : 'transparent',
                color: activeLevel === lvl ? '#ffffff' : sub,
                boxShadow: activeLevel === lvl ? '0 3px 14px rgba(37,99,235,0.45)' : 'none',
                transform: activeLevel === lvl ? 'scale(1.06)' : 'scale(1)',
                transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
                fontFamily: 'inherit',
              }}>
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{lvl}</span>
              <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75, lineHeight: 1 }}>LEVEL</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ BOTTOM ROUTE SHEET ════════════════════════════════════ */}
      {hasRoute && routeStats && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
          display: 'flex', justifyContent: 'center',
          padding: isMobile ? '8px 12px 0' : '8px 16px 24px',
          pointerEvents: 'none',
        }}>
          <div style={{
            ...glassStyle(isDark, {
              width: '100%', maxWidth: isMobile ? '100%' : 420,
              animation: 'sheet-up 0.42s cubic-bezier(0.16,1,0.3,1) forwards',
              pointerEvents: 'all',
              padding: 0,
              borderRadius: isMobile ? '20px 20px 0 0' : 20,
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
                onClick={() => { setDestination(null); setRouteCoordinates([]); setDestQuery('') }}
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
                  <div style={{ fontSize: 20, fontWeight: 700, color: text, lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {routeStats.mins > 0 && <>{routeStats.mins}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2, marginRight: 6 }}>min</span></>}
                    {routeStats.secs}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2 }}>sec</span>
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

            {/* Level change hint */}
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
                        {i > 0 ? ', then ' : ''}Level {t.to}
                      </strong>
                    ))}
                  </span>
                </div>
              </>
            )}

            {/* Safe-area bottom padding for phones */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)', minHeight: isMobile ? 16 : 4 }} />
          </div>
        </div>
      )}
    </div>
  )
}
