import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapCanvas } from './components/map/MapCanvas'
import { QrScanner } from './components/QrScanner'
import { useStore } from './store/useStore'
import type { Level } from './store/useStore'
import {
  Search, X, MapPin, GraduationCap,
  Sun, Moon, ArrowUpDown, Clock,
  ChevronRight, AlertTriangle, Footprints, QrCode
} from 'lucide-react'

const StairsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
    fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 20H13V15H8V10H3V4" />
  </svg>
)

// Local haversine helper (meters)
function haversine(a: [number, number], b: [number, number]): number {
	const [lon1, lat1] = a;
	const [lon2, lat2] = b;
	const R = 6371e3;
	const phi1 = (lat1 * Math.PI) / 180;
	const phi2 = (lat2 * Math.PI) / 180;
	const dPhi = ((lat2 - lat1) * Math.PI) / 180;
	const dLam = ((lon2 - lon1) * Math.PI) / 180;
	const s = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}




// POI color mapping (for markers and listings)
const POI_COLORS: Record<string, { bg: string; glow: string }> = {
	transit: { bg: '#10b981', glow: 'rgba(16,185,129,0.3)' },
	classroom: { bg: '#6366f1', glow: 'rgba(99,102,241,0.3)' },
	default: { bg: '#f43f5e', glow: 'rgba(244,63,94,0.3)' },
};

function poiColor(type: string, category?: string) {
	if (type === 'transit') return POI_COLORS.transit;
	if (category === 'classroom') return POI_COLORS.classroom;
	return POI_COLORS.default;
}

const ALL_LEVELS: { value: Level; label: string }[] = [
  { value: 11, label: '11' },
  { value: 10, label: '10' },
  { value: 9,  label: '9' },
  { value: 8,  label: '8' },
  { value: 7,  label: '7' },
  { value: 6,  label: '6' },
  { value: 5,  label: '5' },
  { value: 4,  label: '4' },
  { value: 3,  label: '3' },
  { value: 2,  label: '2' },
  { value: 1,  label: '1' },
  { value: -1, label: 'B1' },
  { value: -2, label: 'B2' },
  { value: -3, label: 'B3' },
]

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
		<div
			style={{
				width: 32,
				height: 32,
				borderRadius: 10,
				background: bg,
				boxShadow: `0 2px 8px ${glow}`,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				color: '#fff',
				flexShrink: 0,
			}}
		>
			{children}
		</div>
	);
}

// ─── Responsive hook ──────────────────────────────────────────────
function useIsMobile() {
	const [mobile, setMobile] = useState(() => window.innerWidth < 520);
	useEffect(() => {
		const fn = () => setMobile(window.innerWidth < 520);
		window.addEventListener('resize', fn);
		return () => window.removeEventListener('resize', fn);
	}, []);
	return mobile;
}

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const {
    activeLevel, setActiveLevel,
    features, isLoading,
    route, setDestination, setOrigin, setRawOrigin, setRouteCoordinates,
    isAdminMode,
  } = useStore()

  const isMobile = useIsMobile()

  const getMobileLabel = (value: number) => {
    if (value < 0) return `B${Math.abs(value)}`;
    return `L${value}`;
  }

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
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showQrScanner,  setShowQrScanner]  = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const levelRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const hasRouteRef = useRef(false)

  // ── QR result handler ─────────────────────────────────────────────
  const handleQrResult = useCallback((result: { startParam?: string; destParam?: string; levelParam?: string; latParam?: string; lngParam?: string; rawUrl: string }) => {
    setShowQrScanner(false)
    if (!features.length) return

    const { startParam, destParam, levelParam, latParam, lngParam } = result

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
      const lvl = levelParam ? (parseInt(levelParam) as Level) : (1 as Level)
      setRawOrigin([rawLng, rawLat])
      setOrigin([rawLng, rawLat], lvl)
      setOriginQuery(`${rawLat.toFixed(5)}, ${rawLng.toFixed(5)}`)
      setActiveLevel(lvl)
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

    if (levelParam && !startParam && !latParam && !destParam) {
      const lvl = parseInt(levelParam, 10) as Level
      if (!isNaN(lvl) && ALL_LEVELS.some(l => l.value === lvl)) setActiveLevel(lvl)
    }
  }, [features, setRawOrigin, setOrigin, setDestination, setActiveLevel])

  const originDetails = useMemo(() => {
    const startCoords = route.rawOrigin || route.origin
    if (!startCoords) return null
    return features.find(
      f => f.geometry?.type === 'Point' &&
      f.geometry.coordinates[0] === startCoords[0] &&
      f.geometry.coordinates[1] === startCoords[1] &&
      f.properties?.level === route.originLevel
    )
  }, [route.rawOrigin, route.origin, route.originLevel, features])

  const destDetails = useMemo(() => {
    if (!route.destination || route.destination.startsWith('coord:')) return null
    return features.find(f => f.properties?._feature_id === route.destination)
  }, [route.destination, features])

  // ── Auto-scroll active level into view ────────────────────────────
  useEffect(() => {
    const activeBtn = levelRefs.current[activeLevel]
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeLevel])

  // ── Sync labels ──────────────────────────────────────────────────
  useEffect(() => {
    if (!route.destination) { setDestQuery(''); return }
    if (route.destination.startsWith('coord:')) return
    const f = features.find(f => f.properties?._feature_id === route.destination)
    if (f) setDestQuery(f.properties?.name || '')
  }, [route.destination, features])

  // ── Click-outside close ──────────────────────────────────────────
  useEffect(() => {
    const fn = (e: Event) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDestOpen(false); setOriginOpen(false)
        if (hasRouteRef.current) {
          setPanelCollapsed(true)
        }
      }
    }
    document.addEventListener('mousedown', fn)
    document.addEventListener('touchstart', fn)
    return () => {
      document.removeEventListener('mousedown', fn)
      document.removeEventListener('touchstart', fn)
    }
  }, [])

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

    if (levelParam) {
      const lvl = parseInt(levelParam, 10) as Level
      if (!isNaN(lvl) && ALL_LEVELS.some(l => l.value === lvl)) {
        setActiveLevel(lvl)
      }
    }
  }, [isLoading, features, setRawOrigin, setOrigin, setDestination, setActiveLevel])

  // ── Sync Store state -> URL ──────────────────────────────────────
  useEffect(() => {
    if (isLoading || features.length === 0 || !urlLoadedRef.current) return
    const params = new URLSearchParams(window.location.search)

    const startCoords = route.rawOrigin || route.origin
    if (startCoords) {
      const matchedPoi = features.find(
        f => f.geometry?.type === 'Point' &&
        f.geometry.coordinates[0] === startCoords[0] &&
        f.geometry.coordinates[1] === startCoords[1] &&
        f.properties?.level === route.originLevel
      )
      if (matchedPoi) {
        params.set('start', matchedPoi.properties?._feature_id)
      } else {
        params.set('start', `coord:${startCoords[0]},${startCoords[1]},${route.originLevel || activeLevel}`)
      }
      params.delete('lat')
      params.delete('lng')
      params.delete('lon')
      params.delete('longitude')
    } else {
      params.delete('start')
    }

    if (route.destination) {
      params.set('dest', route.destination)
    } else {
      params.delete('dest')
    }

    params.set('level', activeLevel.toString())

    const newSearch = params.toString()
    const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`
    if (window.location.search !== `?${newSearch}`) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [route.rawOrigin, route.originLevel, route.destination, features, activeLevel, isLoading])

  // ── Auto-select starting level when route is rendered ────────────
  const prevRouteKeyRef = useRef('')
  useEffect(() => {
    const originCoords = route.origin
    const destId = route.destination
    const originLevel = route.originLevel

    if (originCoords && destId && originLevel) {
      const currentKey = `${originCoords[0]},${originCoords[1]},${destId}`
      if (prevRouteKeyRef.current !== currentKey) {
        prevRouteKeyRef.current = currentKey
        setActiveLevel(originLevel)
      }
    } else {
      prevRouteKeyRef.current = ''
    }
  }, [route.origin, route.destination, route.originLevel, setActiveLevel])

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
      if (closestPoi && minDistance < 5) {
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

    // Core path distance (includes snap lines already merged)
    let distM = 0
    for (let i = 1; i < route.routeCoordinates.length; i++) {
      distM += haversine(
        [route.routeCoordinates[i - 1][0], route.routeCoordinates[i - 1][1]],
        [route.routeCoordinates[i][0], route.routeCoordinates[i][1]]
      )
    }

    let destName = ''
    if (route.destination?.startsWith('coord:')) {
      destName = 'Destination'
    } else {
      const destFeature = features.find(f => f.properties?._feature_id === route.destination)
      if (destFeature?.geometry?.type === 'Point') {
        destName = destFeature.properties?.name || ''
      }
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
  }, [route.routeCoordinates, route.destination, features])

  const hasRoute  = !!(route.destination && route.routeCoordinates.length > 0)
  const hasOrigin = !!(route.rawOrigin || route.origin)

  // Keep ref in sync for use in click-outside handler (avoids stale closure)
  hasRouteRef.current = hasRoute

  // ── Auto-collapse panel on mobile when route renders ─────────────
  useEffect(() => {
    if (isMobile && hasRoute) {
      setPanelCollapsed(true)
    } else {
      setPanelCollapsed(false)
    }
  }, [isMobile, hasRoute])

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

  // ── Swap / Flip Start and Destination ────────────────────────────
  const handleFlip = () => {
    const currentRawOrigin = route.rawOrigin
    const currentOrigin = route.origin
    const currentOriginLevel = route.originLevel ?? activeLevel
    const currentOriginQuery = originQuery

    const currentDestination = route.destination
    const currentDestQuery = destQuery

    let newRawOrigin: [number, number] | null = null
    let newOrigin: [number, number] | null = null
    let newOriginLevel: Level = activeLevel
    let newOriginQuery = ''

    if (currentDestination) {
      if (currentDestination.startsWith('coord:')) {
        const parts = currentDestination.replace('coord:', '').split(',')
        const lng = parseFloat(parts[0])
        const lat = parseFloat(parts[1])
        const lvl = parseInt(parts[2], 10) as Level
        newRawOrigin = [lng, lat]
        newOrigin = [lng, lat]
        newOriginLevel = lvl
        newOriginQuery = currentDestQuery || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      } else {
        const poi = features.find(f => f.properties?._feature_id === currentDestination || f.properties?.node_id === currentDestination)
        if (poi && poi.geometry?.coordinates) {
          const [lng, lat] = poi.geometry.coordinates
          const lvl = (poi.properties?.level || activeLevel) as Level
          newRawOrigin = [lng, lat]
          newOrigin = [lng, lat]
          newOriginLevel = lvl
          newOriginQuery = poi.properties?.name || ''
        }
      }
    }

    let newDestination: string | null = null
    let newDestQuery = ''

    if (currentRawOrigin || currentOrigin) {
      const coords = currentRawOrigin || currentOrigin
      if (coords) {
        const matchedPoi = features.find(
          f => f.geometry?.type === 'Point' &&
          f.geometry.coordinates[0] === coords[0] &&
          f.geometry.coordinates[1] === coords[1] &&
          f.properties?.level === currentOriginLevel
        )
        if (matchedPoi) {
          newDestination = matchedPoi.properties?._feature_id || matchedPoi.properties?.node_id || null
          newDestQuery = matchedPoi.properties?.name || ''
        } else {
          newDestination = `coord:${coords[0]},${coords[1]},${currentOriginLevel}`
          newDestQuery = currentOriginQuery || `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
        }
      }
    }

    setRawOrigin(newRawOrigin)
    setOrigin(newOrigin, newOriginLevel)
    setOriginQuery(newOriginQuery)

    setDestination(newDestination)
    setDestQuery(newDestQuery)

    if (newOriginLevel) {
      setActiveLevel(newOriginLevel)
    } else if (newDestination) {
      if (newDestination.startsWith('coord:')) {
        const parts = newDestination.replace('coord:', '').split(',')
        setActiveLevel(parseInt(parts[2], 10) as Level)
      } else {
        const poi = features.find(f => f.properties?._feature_id === newDestination || f.properties?.node_id === newDestination)
        if (poi) {
          setActiveLevel((poi.properties?.level || activeLevel) as Level)
        }
      }
    }
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
  const railBottom    = isMobile ? 12 : undefined

  // ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100svh', overflow: 'hidden', userSelect: 'none', background: isDark ? '#000' : '#f0f0f2' }}>

      {/* Full-bleed map */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapCanvas
          isDark={isDark}
          pickingFromMap={!!pickMode}
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

        {/* Glass card — collapsed pill (mobile + route active) */}
        {isMobile && panelCollapsed ? (
          <button
            onClick={() => setPanelCollapsed(false)}
            style={{
              ...glassStyle(isDark),
              display: 'flex', alignItems: 'center', gap: 0,
              padding: '0 6px', height: 52, width: '100%',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              overflow: 'hidden',
            }}
          >
            {/* Origin side */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, padding: '0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(37,99,235,0.5)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {originQuery || 'Start'}
                </span>
              </div>
              {originDetails && (
                <div style={{ fontSize: 10, color: sub, paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {originDetails.properties?.building || originDetails.properties?.type} · Level {originDetails.properties?.level}
                </div>
              )}
            </div>
            {/* Arrow */}
            <ChevronRight size={14} color={faint} style={{ flexShrink: 0 }} />
            {/* Dest side */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, padding: '0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={12} color={sub} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {destQuery || 'Destination'}
                </span>
              </div>
              {destDetails && (
                <div style={{ fontSize: 10, color: sub, paddingLeft: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {destDetails.properties?.building || destDetails.properties?.type} · Level {destDetails.properties?.level}
                </div>
              )}
            </div>
          </button>
        ) : (
        <div style={glassStyle(isDark, { padding: '8px 6px 6px' })}>

          {/* ── QR Scan prominent button (mobile only) ──────────────── */}
          {isMobile && (
          <button
            onClick={() => setShowQrScanner(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '10px 12px 10px 10px',
              borderRadius: 14, border: 'none', cursor: 'pointer',
              background: isDark ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.08)',
              marginBottom: 4,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.22)' : 'rgba(37,99,235,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.08)'}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: '#2563eb',
              boxShadow: '0 3px 12px rgba(37,99,235,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <QrCode size={20} color="#fff" />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Scan QR Code</div>
              <div style={{ fontSize: 11, color: sub, marginTop: 1 }}>Scan a location code to set your starting point</div>
            </div>
            <ChevronRight size={16} color={faint} />
          </button>
          )}




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

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <input
                  type="text"
                  placeholder={pickMode === 'origin' ? 'Tap the map to set start…' : 'Your starting point'}
                  value={originQuery}
                  onChange={e => { setOriginQuery(e.target.value); setOriginOpen(true); setDestOpen(false); setPickMode(false) }}
                  onFocus={() => { if (pickMode !== 'origin') { setOriginOpen(true); setDestOpen(false); } }}
                  onKeyDown={onOriginKey}
                  style={{
                    width: '100%', background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                    fontFamily: 'inherit',
                  }}
                />
                {originDetails && (
                  <div style={{ fontSize: 10, color: sub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {originDetails.properties?.building || originDetails.properties?.type} · Level {originDetails.properties?.level}
                  </div>
                )}
              </div>

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
                {/* QR scan as first option (mobile only, when nothing typed) */}
                {!originQuery && isMobile && (
                  <DropItem
                    name="Scan QR Code"
                    sub="Open camera to scan a location QR code"
                    type="pick-map"
                    isActive={false}
                    onHover={() => {}}
                    onClick={() => { setOriginOpen(false); setShowQrScanner(true) }}
                  />
                )}
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

          {/* Connector dots + Flip Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', height: 24, padding: '2px 20px' }}>
            <div style={{ position: 'absolute', left: 26.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)' }} />
              ))}
            </div>
            <button
              title="Swap start and destination"
              onClick={handleFlip}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '50%',
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sub,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = text; e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = sub; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <ArrowUpDown size={13} />
            </button>
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
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <input
                  type="text"
                  placeholder={pickMode === 'dest' ? 'Tap the map to set destination…' : 'Where do you want to go?'}
                  value={destQuery}
                  onChange={e => { setDestQuery(e.target.value); setDestOpen(true); setOriginOpen(false); setDestIdx(-1); setPickMode(false) }}
                  onFocus={() => { if (pickMode !== 'dest') { setDestOpen(true); setOriginOpen(false); } }}
                  onKeyDown={onDestKey}
                  style={{
                    width: '100%', background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 14, fontWeight: 500, color: text, caretColor: '#2563eb',
                    fontFamily: 'inherit',
                  }}
                />
                {destDetails && (
                  <div style={{ fontSize: 10, color: sub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {destDetails.properties?.building || destDetails.properties?.type} · Level {destDetails.properties?.level}
                  </div>
                )}
              </div>
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

          {/* ── Route info (integrated) ────────────────────────────── */}
          {hasRoute && routeStats && !isMobile && (
            <div className="route-info-enter">
              {/* Divider */}
              <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', margin: '16px 10px 14px' }} />

              {/* Separation Label */}
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, padding: '0 12px 10px' }}>
                Route Details
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 12px 10px', gap: 16 }}>
                {/* Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={15} color="#3b82f6" />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: text, lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {routeStats.mins > 0 && (
                        <>
                          {routeStats.mins}
                          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 1, marginRight: 4 }}>min</span>
                        </>
                      )}
                      {(routeStats.secs > 0 || routeStats.mins === 0) && (
                        <>
                          {routeStats.secs}
                          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 1 }}>sec</span>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: faint, marginTop: 2, fontWeight: 500 }}>walking</div>
                  </div>
                </div>

                <div style={{ width: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }} />

                {/* Distance */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Footprints size={15} color="#10b981" />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: text, lineHeight: 1 }}>{routeStats.distStr}</div>
                    <div style={{ fontSize: 9, color: faint, marginTop: 2, fontWeight: 500 }}>distance</div>
                  </div>
                </div>
              </div>

              {/* Level change hint */}
              {routeStats.transitions.length > 0 && (
                <>
                  <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', margin: '0 10px 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 12px' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ArrowUpDown size={14} color="#8b5cf6" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: text }}>
                      Take lift/stairs to{' '}
                      {routeStats.transitions.map((t, i) => (
                        <strong key={i} style={{ color: '#8b5cf6' }}>
                          {i > 0 ? ', then ' : ''}Level {t.to}
                        </strong>
                      ))}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom inner spacing */}
          <div style={{ height: 2 }} />
        </div>
        )}

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
        left: isMobile ? 12 : undefined,
        right: isMobile ? 12 : railRight,
        top: isMobile ? undefined : railTop,
        bottom: isMobile ? 12 : railBottom,
        width: isMobile ? 'calc(100vw - 24px)' : undefined,
        zIndex: 40,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'column',
        alignItems: 'center',
        gap: isMobile ? 6 : 10,
      }}>

        {/* ── Mobile transit hint (multistorey routes only) ─────────── */}
        {isMobile && hasRoute && routeStats && routeStats.transitions.length > 0 && (
          <div style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px',
            borderRadius: 14,
            background: isDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.10)',
            border: '1px solid rgba(139,92,246,0.30)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 8,
              background: isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ArrowUpDown size={13} color="#8b5cf6" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', lineHeight: 1.3 }}>
              Take lift/stairs to{' '}
              {routeStats.transitions.map((t, i) => (
                <span key={i}>{i > 0 ? ', then ' : ''}Level {t.to}</span>
              ))}
            </span>
          </div>
        )}

        {/* Combined Control Panel (theme + levels) */}
        <div style={glassStyle(isDark, {
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          alignItems: 'center',
          padding: '6px',
          gap: 6,
          width: isMobile ? '100%' : undefined,
        })}>
          {/* Dark / light toggle */}
          <button
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setIsDark(d => !d)}
            style={{
              width: isMobile ? 40 : 46, height: isMobile ? 40 : 46, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: 'none', background: 'transparent',
              color: isDark ? '#fbbf24' : '#6e6e73',
              transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = hov}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Divider */}
          <div style={{
            height: isMobile ? 24 : 1,
            width: isMobile ? 1 : 24,
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            margin: isMobile ? '0 4px' : '4px 0',
            flexShrink: 0,
          }} />

          {/* Level selector */}
          <div className="no-scrollbar" style={{
            display: 'flex', 
            flexDirection: isMobile ? 'row' : 'column', 
            gap: 8,
            maxHeight: isMobile ? undefined : 'calc(100svh - 160px)', 
            maxWidth: isMobile ? 'calc(100vw - 120px)' : undefined,
            overflowY: isMobile ? 'hidden' : 'auto',
            overflowX: isMobile ? 'auto' : 'hidden',
            paddingLeft: isMobile ? 8 : 4,
            paddingRight: isMobile ? 8 : 6,
            paddingTop: isMobile ? 4 : 8,
            paddingBottom: isMobile ? 4 : 8,
          }}>
             {(isMobile ? [...ALL_LEVELS].reverse() : ALL_LEVELS).map(lvl => {
              const isActive = activeLevel === lvl.value
              const isDestLevel = hasRoute && routeStats && routeStats.transitions.length > 0 &&
                routeStats.transitions[routeStats.transitions.length - 1].to === lvl.value
              return (
              <button
                key={lvl.value}
                ref={el => { levelRefs.current[lvl.value] = el }}
                onClick={() => setActiveLevel(lvl.value)}
                style={{
                  width: isMobile ? 44 : 46, height: isMobile ? 40 : 40, borderRadius: 12,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, cursor: 'pointer',
                  flexShrink: 0,
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#ffffff' : isDestLevel ? '#8b5cf6' : sub,
                  boxShadow: isActive ? '0 3px 14px rgba(37,99,235,0.45)' : 'none',
                  transform: isActive ? 'scale(1.06)' : 'scale(1)',
                  transition: 'all 0.22s cubic-bezier(0.34,1.26,0.64,1)',
                  fontFamily: 'inherit',
                  border: isDestLevel && !isActive ? '2px solid rgba(139,92,246,0.55)' : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, lineHeight: 1 }}>
                  {isMobile ? getMobileLabel(lvl.value) : lvl.label}
                </span>
                {!isMobile && (
                  <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.75, lineHeight: 1 }}>LEVEL</span>
                )}
              </button>
              )
            })}
          </div>
        </div>
      </div>
      {/* ═══ QR SCANNER MODAL ═══════════════════════════════════════ */}
      {showQrScanner && (
        <QrScanner
          isDark={isDark}
          onResult={handleQrResult}
          onClose={() => setShowQrScanner(false)}
        />
      )}
    </div>
  )
}
