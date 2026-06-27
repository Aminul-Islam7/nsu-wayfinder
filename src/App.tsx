import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapCanvas } from './components/map/MapCanvas';
import { useStore } from './store/useStore';
import type { Level } from './store/useStore';
import { useDeviceOrientation } from './hooks/useDeviceOrientation';
import { useDeadReckoning } from './hooks/useDeadReckoning';
import { useGeolocation } from './hooks/useGeolocation';
import { Search, X, MapPin, GraduationCap, Sun, Moon, ArrowUpDown, Clock, Route, ChevronRight, AlertTriangle, Footprints, Radio, Star, Crosshair } from 'lucide-react';
import { nearestPointOnLine, point } from '@turf/turf';

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

// ─────────────────────────────────────────────────────────────────
// PROFESSIONAL DESIGN TOKENS (NSU Wayfinder - Google Maps Style)
// ─────────────────────────────────────────────────────────────────
const DESIGN_TOKENS = {
	colors: {
		light: {
			bg: '#ffffff',
			surface: '#f8f9fa',
			text: '#202124',
			secondary: '#5f6368',
			tertiary: '#9aa0a6',
			divider: '#e8eaed',
			primary: '#003DA5', // NSU Blue
			accent: '#00A86B', // NSU Green
			success: '#10b981',
			info: '#6366f1',
			action: '#f97316',
		},
		dark: {
			bg: '#121212',
			surface: '#1e1e1e',
			text: '#e8eaed',
			secondary: '#bdc1c6',
			tertiary: '#80868b',
			divider: '#303134',
			primary: '#4a9eff', // Lighter NSU Blue for dark mode
			accent: '#4ade80', // Lighter green for dark mode
			success: '#10b981',
			info: '#818cf8',
			action: '#fb923c',
		},
	},
	spacing: {
		xs: 4,
		sm: 8,
		md: 12,
		lg: 16,
		xl: 24,
		xxl: 32,
	},
	radius: {
		sm: 8,
		md: 12,
		lg: 16,
		full: 9999,
	},
	shadow: {
		sm: '0 1px 2px rgba(0,0,0,0.05)',
		md: '0 4px 12px rgba(0,0,0,0.08)',
		lg: '0 8px 24px rgba(0,0,0,0.12)',
		xl: '0 16px 40px rgba(0,0,0,0.16)',
	},
	transitions: {
		fast: '150ms ease-out',
		base: '200ms ease-out',
		slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
	},
};

// Get colors based on dark mode
function colors(isDark: boolean) {
	return DESIGN_TOKENS.colors[isDark ? 'dark' : 'light'];
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

// ─── Professional glass morphism (NSU-themed) ───
function glassStyle(isDark: boolean, extra?: React.CSSProperties): React.CSSProperties {
	return {
		background: isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.90)',
		backdropFilter: 'blur(20px) saturate(180%)',
		WebkitBackdropFilter: 'blur(20px) saturate(180%)',
		border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
		boxShadow: DESIGN_TOKENS.shadow.lg,
		borderRadius: DESIGN_TOKENS.radius.lg,
		...extra,
	};
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
	const { activeLevel, setActiveLevel, features, isLoading, route, setDestination, setOrigin, setRawOrigin, setRouteCoordinates, isAdminMode, trackingEnabled, setTrackingEnabled, gpsActive, setGpsActive } = useStore();

	const isMobile = useIsMobile();

	// ── Theme ────────────────────────────────────────────────────────
	const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches);
	useEffect(() => {
		document.documentElement.classList.toggle('dark', isDark);
	}, [isDark]);

	const c = colors(isDark);
	// Convenience aliases for existing code
	const text = c.text;
	const sub = c.secondary;
	const faint = c.tertiary;
	const hov = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
	const showInitialLoading = isLoading && features.length === 0;

	// ── Search state ─────────────────────────────────────────────────
	const [destQuery, setDestQuery] = useState('');
	const [destOpen, setDestOpen] = useState(false);
	const [destIdx, setDestIdx] = useState(-1);
	const [originQuery, setOriginQuery] = useState('');
	const [originOpen, setOriginOpen] = useState(false);
	const [originIdx, setOriginIdx] = useState(-1);
	const [pickMode, setPickMode] = useState<'origin' | 'dest' | false>(false);
	const [recentDestinations, setRecentDestinations] = useState<string[]>(() => {
		if (typeof window === 'undefined') return [];
		try {
			return JSON.parse(window.localStorage.getItem('nsu-wayfinder:recent-destinations') || '[]') as string[];
		} catch {
			return [];
		}
	});
	const [favoriteDestinations, setFavoriteDestinations] = useState<string[]>(() => {
		if (typeof window === 'undefined') return [];
		try {
			return JSON.parse(window.localStorage.getItem('nsu-wayfinder:favorites') || '[]') as string[];
		} catch {
			return [];
		}
	});

	const panelRef = useRef<HTMLDivElement>(null);

	// Bottom-sheet expanded state (persisted across reloads)
	const [sheetExpanded, setSheetExpanded] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false;
		try {
			return JSON.parse(window.localStorage.getItem('nsu-wayfinder:sheet-expanded') || 'false');
		} catch {
			return false;
		}
	});

	// Drag tracking refs for touch gestures
	const dragRef = useRef({ dragging: false, startY: 0, lastY: 0, lastTime: 0 });

	// Route panel collapsed (hidden) state — keeps route data but hides the sheet
	const [routeCollapsed, setRouteCollapsed] = useState(false);

	const mobileSheetOpen = destOpen || originOpen || pickMode !== false;

	// Derived sheet open state (we allow explicit expansion or open when inputs are active)
	const sheetInteractOpen = sheetExpanded || mobileSheetOpen;

	// ── Compass / orientation ─────────────────────────────────────────
	const { heading, hasCompass, permissionGranted: compassGranted, requestPermission: reqCompass } = useDeviceOrientation();

	// ── GPS tracking ─────────────────────────────────────────────────
	// Last GPS fix accuracy — prefer GPS when accuracy < 30m, else dead reckon
	const gpsAccRef = useRef<number>(Infinity);

	const handleGpsPosition = useCallback(
		(lng: number, lat: number, accuracy: number) => {
			gpsAccRef.current = accuracy;
			const isGoodFix = accuracy < 50;
			setGpsActive(isGoodFix);

			if (isGoodFix) {
				// Snap to nearest path and update origin
				setRawOrigin([lng, lat]);
				const originLvl = (route.originLevel ?? activeLevel) as Level;
				const levelPaths = features.filter((f) => f.geometry && f.properties?.type === 'path' && f.properties?.level === originLvl);
				if (levelPaths.length > 0) {
					try {
						const pt = point([lng, lat]);
						let minDist = Infinity;
						let snapped: [number, number] | null = null;
						for (const pf of levelPaths) {
							const s = nearestPointOnLine(pf, pt);
							const d = s.properties?.dist ?? Infinity;
							if (d < minDist) {
								minDist = d;
								snapped = s.geometry.coordinates as [number, number];
							}
						}
						if (snapped) setOrigin(snapped, originLvl);
					} catch {
						/* ignore snap error */
					}
				} else {
					setOrigin([lng, lat], originLvl);
				}
			}
		},
		[features, activeLevel, route.originLevel, setGpsActive, setRawOrigin, setOrigin],
	);

	useGeolocation({ enabled: trackingEnabled, onPosition: handleGpsPosition });

	// ── Dead reckoning (kicks in when GPS unavailable / indoors) ─────
	const currentPos = route.rawOrigin ?? route.origin ?? null;

	const handleDrPosition = useCallback(
		(lng: number, lat: number) => {
			// Only use dead reckoning when GPS is poor
			if (gpsAccRef.current < 50) return;
			setGpsActive(false);
			setRawOrigin([lng, lat]);
			const originLvl = (route.originLevel ?? activeLevel) as Level;
			const levelPaths = features.filter((f) => f.geometry && f.properties?.type === 'path' && f.properties?.level === originLvl);
			if (levelPaths.length > 0) {
				try {
					const pt = point([lng, lat]);
					let minDist = Infinity;
					let snapped: [number, number] | null = null;
					for (const pf of levelPaths) {
						const s = nearestPointOnLine(pf, pt);
						const d = s.properties?.dist ?? Infinity;
						if (d < minDist) {
							minDist = d;
							snapped = s.geometry.coordinates as [number, number];
						}
					}
					if (snapped) setOrigin(snapped, originLvl);
				} catch {
					/* ignore */
				}
			} else {
				setOrigin([lng, lat], originLvl);
			}
		},
		[gpsAccRef, features, activeLevel, route.originLevel, setGpsActive, setRawOrigin, setOrigin],
	);

	useDeadReckoning({
		enabled: trackingEnabled && !gpsActive,
		heading,
		onPositionUpdate: handleDrPosition,
		initialPosition: currentPos,
	});

	// ── Auto-request iOS orientation permission on first interaction ─
	useEffect(() => {
		if (!compassGranted) {
			const fn = () => {
				reqCompass();
				document.removeEventListener('touchstart', fn);
			};
			document.addEventListener('touchstart', fn, { once: true });
			return () => document.removeEventListener('touchstart', fn);
		}
	}, [compassGranted, reqCompass]);

	// ── Sync labels ──────────────────────────────────────────────────
	useEffect(() => {
		if (!route.destination) {
			setDestQuery('');
			return;
		}
		if (route.destination.startsWith('coord:')) return;
		const f = features.find((f) => f.properties?._feature_id === route.destination);
		if (f) setDestQuery(f.properties?.name || '');
	}, [route.destination, features]);

	// (originQuery clearing moved to the clear button onClick explicitly to avoid side-effects)

	// ── Click-outside close ──────────────────────────────────────────
	useEffect(() => {
		const fn = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				setDestOpen(false);
				setOriginOpen(false);
			}
		};
		document.addEventListener('mousedown', fn);
		return () => document.removeEventListener('mousedown', fn);
	}, []);

	// ── Global Esc to close panels / sheet
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setDestOpen(false);
				setOriginOpen(false);
				setSheetState(false);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	// Refs for inputs to focus from compact bar
	const destInputRef = useRef<HTMLInputElement | null>(null);
	const originInputRef = useRef<HTMLInputElement | null>(null);

	// ── Handle touch/drag gestures on the sheet drag handle
	const onHandleTouchStart = (e: React.TouchEvent) => {
		dragRef.current.dragging = true;
		dragRef.current.startY = e.touches[0].clientY;
		dragRef.current.lastY = e.touches[0].clientY;
		dragRef.current.lastTime = Date.now();
	};

	const onHandleTouchMove = (e: React.TouchEvent) => {
		if (!dragRef.current.dragging) return;
		dragRef.current.lastY = e.touches[0].clientY;
		dragRef.current.lastTime = Date.now();
	};

	const onHandleTouchEnd = () => {
		if (!dragRef.current.dragging) return;
		dragRef.current.dragging = false;
		const delta = dragRef.current.lastY - dragRef.current.startY; // positive = downward
		// simple thresholds: swipe up to open, swipe down to close
		if (delta < -60) {
			setSheetState(true, true);
			if (navigator.vibrate) navigator.vibrate(10);
		} else if (delta > 60) {
			setSheetState(false);
			if (navigator.vibrate) navigator.vibrate(8);
		} else {
			// small flick — toggle
			setSheetState(!sheetVisible, !sheetVisible);
			if (navigator.vibrate) navigator.vibrate(6);
		}
	};

	// ── Sync URL -> Store state on initial load ─────────────────────
	const urlLoadedRef = useRef(false);
	useEffect(() => {
		if (isLoading || features.length === 0 || urlLoadedRef.current) return;
		urlLoadedRef.current = true;

		const params = new URLSearchParams(window.location.search);
		const startParam = params.get('start');
		const destParam = params.get('dest');

		// Support legacy params (lat, lng, level) as fallback
		const latParam = params.get('lat');
		const lngParam = params.get('lng') || params.get('lon') || params.get('longitude');
		const levelParam = params.get('level');

		if (startParam) {
			if (startParam.startsWith('coord:')) {
				const parts = startParam.replace('coord:', '').split(',');
				if (parts.length >= 3) {
					const lng = parseFloat(parts[0]);
					const lat = parseFloat(parts[1]);
					const lvl = parseInt(parts[2]) as Level;
					setRawOrigin([lng, lat]);
					setOrigin([lng, lat], lvl);
					setOriginQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
					setActiveLevel(lvl);
				}
			} else {
				const p = features.find((f) => f.properties?._feature_id === startParam);
				if (p && p.geometry?.coordinates) {
					const [lng, lat] = p.geometry.coordinates;
					const lvl = (p.properties?.level || 1) as Level;
					setRawOrigin([lng, lat]);
					setOrigin([lng, lat], lvl);
					setOriginQuery(p.properties?.name || '');
					setActiveLevel(lvl);
				}
			}
		} else if (latParam && lngParam) {
			const rawLat = parseFloat(latParam);
			const rawLng = parseFloat(lngParam);
			const rawLevel = levelParam ? (parseInt(levelParam) as Level) : (1 as Level);
			setRawOrigin([rawLng, rawLat]);
			setOrigin([rawLng, rawLat], rawLevel);
			setOriginQuery(`${rawLat.toFixed(5)}, ${rawLng.toFixed(5)}`);
			setActiveLevel(rawLevel);
		}

		if (destParam) {
			if (destParam.startsWith('coord:')) {
				const parts = destParam.replace('coord:', '').split(',');
				if (parts.length >= 3) {
					const lng = parseFloat(parts[0]);
					const lat = parseFloat(parts[1]);
					setDestination(destParam);
					setDestQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
					setActiveLevel(parseInt(parts[2]) as Level);
				}
			} else {
				const p = features.find((f) => f.properties?._feature_id === destParam);
				if (p) {
					setDestination(destParam);
					setDestQuery(p.properties?.name || '');
					setActiveLevel((p.properties?.level || 1) as Level);
				}
			}
		}

		if (levelParam) {
			const lvl = parseInt(levelParam, 10) as Level;
			if (lvl === 1 || lvl === 2) {
				setActiveLevel(lvl);
			}
		}
	}, [isLoading, features, setRawOrigin, setOrigin, setDestination, setActiveLevel]);

	// ── Sync Store state -> URL ──────────────────────────────────────
	useEffect(() => {
		if (isLoading || features.length === 0 || !urlLoadedRef.current) return;
		const params = new URLSearchParams(window.location.search);

		const startCoords = route.rawOrigin || route.origin;
		if (startCoords) {
			const matchedPoi = features.find((f) => f.geometry?.type === 'Point' && f.geometry.coordinates[0] === startCoords[0] && f.geometry.coordinates[1] === startCoords[1] && f.properties?.level === route.originLevel);
			if (matchedPoi) {
				params.set('start', matchedPoi.properties?._feature_id);
			} else {
				params.set('start', `coord:${startCoords[0]},${startCoords[1]},${route.originLevel || activeLevel}`);
			}
			params.delete('lat');
			params.delete('lng');
			params.delete('lon');
			params.delete('longitude');
		} else {
			params.delete('start');
		}

		if (route.destination) {
			params.set('dest', route.destination);
		} else {
			params.delete('dest');
		}

		params.set('level', activeLevel.toString());

		const newSearch = params.toString();
		const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
		if (window.location.search !== `?${newSearch}`) {
			window.history.replaceState(null, '', newUrl);
		}
	}, [route.rawOrigin, route.originLevel, route.destination, features, activeLevel, isLoading]);

	// ── Auto-select starting level when route is rendered ────────────
	const prevRouteKeyRef = useRef('');
	useEffect(() => {
		const originCoords = route.origin;
		const destId = route.destination;
		const originLevel = route.originLevel;

		if (originCoords && destId && originLevel) {
			const currentKey = `${originCoords[0]},${originCoords[1]},${destId}`;
			if (prevRouteKeyRef.current !== currentKey) {
				prevRouteKeyRef.current = currentKey;
				setActiveLevel(originLevel);
			}
		} else {
			prevRouteKeyRef.current = '';
		}
	}, [route.origin, route.destination, route.originLevel, setActiveLevel]);

	// ── POI lists ────────────────────────────────────────────────────
	const pois = useMemo(() => features.filter((f) => f.properties?.type === 'poi').sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || '')), [features]);
	const points = useMemo(() => features.filter((f) => f.geometry?.type === 'Point' && (f.properties?.type === 'poi' || f.properties?.type === 'transit')).sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || '')), [features]);
	const filteredDest = pois.filter((p) => (p.properties?.name || '').toLowerCase().includes(destQuery.toLowerCase()));
	const filteredOrigin = points.filter((p) => (p.properties?.name || '').toLowerCase().includes(originQuery.toLowerCase())).slice(0, 8);
	const featureById = useCallback(
		(id: string | null | undefined) => {
			if (!id) return null;
			return features.find((feature) => feature.properties?._feature_id === id || feature.properties?.node_id === id) || null;
		},
		[features],
	);
	const quickDestinations = useMemo(() => {
		const keywords = ['library', 'admin', 'cafeteria', 'washroom', 'restroom', 'lab', 'reception'];
		return keywords
			.map((keyword) => features.find((feature) => (feature.properties?.name || '').toLowerCase().includes(keyword)))
			.filter((feature, index, array) => feature && array.findIndex((item) => item?.properties?._feature_id === feature?.properties?._feature_id) === index)
			.slice(0, 6);
	}, [features]);
	const favoriteFeatureObjects = useMemo(() => favoriteDestinations.map((id) => featureById(id)).filter(Boolean), [favoriteDestinations, featureById]);
	const recentFeatureObjects = useMemo(() => recentDestinations.map((id) => featureById(id)).filter(Boolean), [recentDestinations, featureById]);

	const persistRecentDestination = useCallback((id: string) => {
		setRecentDestinations((current) => {
			const next = [id, ...current.filter((item) => item !== id)].slice(0, 6);
			window.localStorage.setItem('nsu-wayfinder:recent-destinations', JSON.stringify(next));
			return next;
		});
	}, []);
	const toggleFavoriteDestination = useCallback((id: string) => {
		setFavoriteDestinations((current) => {
			const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
			window.localStorage.setItem('nsu-wayfinder:favorites', JSON.stringify(next));
			return next;
		});
	}, []);
	const selectFeatureDestination = useCallback(
		(feature: any) => {
			const id = feature?.properties?._feature_id || feature?.properties?.node_id;
			if (!id) return;
			setDestination(id);
			setDestQuery(feature.properties?.name || '');
			setDestOpen(false);
			setDestIdx(-1);
			persistRecentDestination(id);
		},
		[persistRecentDestination, setDestination],
	);

	// ── Map pick origin ──────────────────────────────────────────────
	const onMapPick = useCallback(
		(e: Event) => {
			if (!pickMode) return;
			let { lng, lat, level, featureId, name } = (e as CustomEvent).detail as { lng: number; lat: number; level: Level; featureId?: string; name?: string };

			// Snap to nearest POI if click is very close (under 2.5m)
			if (!featureId) {
				const levelPois = features.filter((f) => f.geometry?.type === 'Point' && (f.properties?.type === 'poi' || f.properties?.type === 'transit') && f.properties?.level === level);
				let minDistance = Infinity;
				let closestPoi: any = null;
				for (const poi of levelPois) {
					const d = haversine([lng, lat], poi.geometry.coordinates as [number, number]);
					if (d < minDistance) {
						minDistance = d;
						closestPoi = poi;
					}
				}
				if (closestPoi && minDistance < 5) {
					featureId = closestPoi.properties?._feature_id || closestPoi.properties?.node_id;
					name = closestPoi.properties?.name || 'POI';
					lng = closestPoi.geometry.coordinates[0];
					lat = closestPoi.geometry.coordinates[1];
				}
			}

			if (pickMode === 'origin') {
				setRawOrigin([lng, lat]);
				setOrigin([lng, lat], level);
				setOriginQuery(featureId ? name || '' : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
			} else if (pickMode === 'dest') {
				if (featureId) {
					setDestination(featureId);
					setDestQuery(name || '');
				} else {
					setDestination(`coord:${lng},${lat},${level}`);
					setDestQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
				}
			}
			setPickMode(false);
		},
		[pickMode, features, setRawOrigin, setOrigin, setDestination, setDestQuery],
	);

	useEffect(() => {
		document.addEventListener('map:pick-origin', onMapPick);
		return () => document.removeEventListener('map:pick-origin', onMapPick);
	}, [onMapPick]);

	// ── Route stats ──────────────────────────────────────────────────
	const routeStats = useMemo(() => {
		if (!route.routeCoordinates || route.routeCoordinates.length < 2) return null;

		// Core path distance (includes snap lines already merged)
		let distM = 0;
		for (let i = 1; i < route.routeCoordinates.length; i++) {
			distM += haversine([route.routeCoordinates[i - 1][0], route.routeCoordinates[i - 1][1]], [route.routeCoordinates[i][0], route.routeCoordinates[i][1]]);
		}

		let destName = '';
		if (route.destination?.startsWith('coord:')) {
			destName = 'Destination';
		} else {
			const destFeature = features.find((f) => f.properties?._feature_id === route.destination);
			if (destFeature?.geometry?.type === 'Point') {
				destName = destFeature.properties?.name || '';
			}
		}

		const totalSeconds = Math.round(distM / 1.2);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;

		const distStr = distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`;

		const transitions: Array<{ from: number; to: number }> = [];
		for (let i = 1; i < route.routeCoordinates.length; i++) {
			const prev = route.routeCoordinates[i - 1][2],
				curr = route.routeCoordinates[i][2];
			if (curr !== prev && !transitions.find((t) => t.from === prev && t.to === curr)) transitions.push({ from: prev, to: curr });
		}

		return { distStr, mins, secs, transitions, destName };
	}, [route.routeCoordinates, route.destination, features]);

	const hasRoute = !!(route.destination && route.routeCoordinates.length > 0);
	const hasOrigin = !!(route.rawOrigin || route.origin);

	// ── Keyboard nav helpers ─────────────────────────────────────────
	const onDestKey = (e: React.KeyboardEvent) => {
		if (!destOpen || !filteredDest.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setDestIdx((i) => Math.min(i + 1, filteredDest.length - 1));
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setDestIdx((i) => Math.max(i - 1, 0));
		}
		if (e.key === 'Enter' && destIdx >= 0) selectDest(filteredDest[destIdx]);
		if (e.key === 'Escape') {
			setDestOpen(false);
			setDestIdx(-1);
		}
	};
	const onOriginKey = (e: React.KeyboardEvent) => {
		if (!originOpen || !filteredOrigin.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setOriginIdx((i) => Math.min(i + 1, filteredOrigin.length - 1));
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setOriginIdx((i) => Math.max(i - 1, 0));
		}
		if (e.key === 'Enter' && originIdx >= 0) selectOrigin(filteredOrigin[originIdx]);
		if (e.key === 'Escape') {
			setOriginOpen(false);
			setOriginIdx(-1);
		}
	};
	const selectDest = (poi: any) => {
		selectFeatureDestination(poi);
	};
	const selectOrigin = (p: any) => {
		const [lng, lat] = p.geometry.coordinates;
		const level = (p.properties?.level || activeLevel) as Level;
		setRawOrigin([lng, lat]);
		setOrigin([lng, lat], level);
		setOriginQuery(p.properties.name);
		setOriginOpen(false);
		setOriginIdx(-1);
	};

	// ── Swap / Flip Start and Destination ────────────────────────────
	const handleFlip = () => {
		const currentRawOrigin = route.rawOrigin;
		const currentOrigin = route.origin;
		const currentOriginLevel = route.originLevel ?? activeLevel;
		const currentOriginQuery = originQuery;

		const currentDestination = route.destination;
		const currentDestQuery = destQuery;

		let newRawOrigin: [number, number] | null = null;
		let newOrigin: [number, number] | null = null;
		let newOriginLevel: Level = activeLevel;
		let newOriginQuery = '';

		if (currentDestination) {
			if (currentDestination.startsWith('coord:')) {
				const parts = currentDestination.replace('coord:', '').split(',');
				const lng = parseFloat(parts[0]);
				const lat = parseFloat(parts[1]);
				const lvl = parseInt(parts[2], 10) as Level;
				newRawOrigin = [lng, lat];
				newOrigin = [lng, lat];
				newOriginLevel = lvl;
				newOriginQuery = currentDestQuery || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
			} else {
				const poi = features.find((f) => f.properties?._feature_id === currentDestination || f.properties?.node_id === currentDestination);
				if (poi && poi.geometry?.coordinates) {
					const [lng, lat] = poi.geometry.coordinates;
					const lvl = (poi.properties?.level || activeLevel) as Level;
					newRawOrigin = [lng, lat];
					newOrigin = [lng, lat];
					newOriginLevel = lvl;
					newOriginQuery = poi.properties?.name || '';
				}
			}
		}

		let newDestination: string | null = null;
		let newDestQuery = '';

		if (currentRawOrigin || currentOrigin) {
			const coords = currentRawOrigin || currentOrigin;
			if (coords) {
				const matchedPoi = features.find((f) => f.geometry?.type === 'Point' && f.geometry.coordinates[0] === coords[0] && f.geometry.coordinates[1] === coords[1] && f.properties?.level === currentOriginLevel);
				if (matchedPoi) {
					newDestination = matchedPoi.properties?._feature_id || matchedPoi.properties?.node_id || null;
					newDestQuery = matchedPoi.properties?.name || '';
				} else {
					newDestination = `coord:${coords[0]},${coords[1]},${currentOriginLevel}`;
					newDestQuery = currentOriginQuery || `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`;
				}
			}
		}

		setRawOrigin(newRawOrigin);
		setOrigin(newOrigin, newOriginLevel);
		setOriginQuery(newOriginQuery);

		setDestination(newDestination);
		setDestQuery(newDestQuery);

		if (newOriginLevel) {
			setActiveLevel(newOriginLevel);
		} else if (newDestination) {
			if (newDestination.startsWith('coord:')) {
				const parts = newDestination.replace('coord:', '').split(',');
				setActiveLevel(parseInt(parts[2], 10) as Level);
			} else {
				const poi = features.find((f) => f.properties?._feature_id === newDestination || f.properties?.node_id === newDestination);
				if (poi) {
					setActiveLevel((poi.properties?.level || activeLevel) as Level);
				}
			}
		}
	};

	// ── Dropdown item renderer ───────────────────────────────────────
	const DropItem = ({ name, sub: subtitle, type, category, transitType, isActive, onClick, onHover }: { name: string; sub: string; type: string; category?: string; transitType?: string; isActive: boolean; onClick: () => void; onHover: () => void }) => {
		const c = type === 'pick-map' ? { bg: '#3b82f6', glow: 'rgba(59,130,246,0.3)' } : poiColor(type, category);
		return (
			<button
				onMouseEnter={onHover}
				onClick={onClick}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					padding: '10px 12px',
					borderRadius: 12,
					width: '100%',
					textAlign: 'left',
					cursor: 'pointer',
					border: 'none',
					background: isActive ? (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(37,99,235,0.07)') : 'transparent',
					transition: 'background 0.12s ease',
				}}
			>
				<IconBox bg={c.bg} glow={c.glow}>
					{type === 'pick-map' ? <MapPin size={14} /> : type === 'transit' ? transitType === 'staircase' ? <Footprints size={14} /> : <ArrowUpDown size={14} /> : category === 'classroom' ? <GraduationCap size={14} /> : <MapPin size={14} />}
				</IconBox>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontWeight: 600, fontSize: 13, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
					<div style={{ fontSize: 10, fontWeight: 500, color: sub, marginTop: 1 }}>{subtitle}</div>
				</div>
				<ChevronRight size={14} color={faint} style={{ flexShrink: 0 }} />
			</button>
		);
	};

	const FavoriteChip = ({ feature, onToggle }: { feature: any; onToggle?: () => void }) => {
		const id = feature?.properties?._feature_id || feature?.properties?.node_id;
		const name = feature?.properties?.name || 'Place';
		const isFavorite = !!id && favoriteDestinations.includes(id);
		return (
			<button
				onClick={() => {
					if (!id) return;
					selectFeatureDestination(feature);
					onToggle?.();
				}}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 8,
					padding: '8px 12px',
					borderRadius: 999,
					border: 'none',
					cursor: 'pointer',
					background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
					color: text,
					whiteSpace: 'nowrap',
					fontSize: 12,
					fontWeight: 600,
				}}
			>
				<Star size={13} fill={isFavorite ? c.primary : 'none'} color={isFavorite ? c.primary : sub} />
				<span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
			</button>
		);
	};

	// ── Responsive layout values ─────────────────────────────────────
	const adminOffset = isAdminMode ? (isMobile ? 40 : 52) : 0;
	const searchTop = 16 + adminOffset;
	// On mobile: panel goes full-width with 12px margins on each side
	const searchLeft = isMobile ? 12 : 16;
	const searchWidth = isMobile ? 'calc(100vw - 24px)' : 'min(340px, calc(100vw - 80px))';
	// Compact bottom-left controls so they sit beneath the collapsed route summary
	const controlBarLeft = 12;
	const controlBarBottom = isMobile ? 48 : 36;
	const sheetVisible = isMobile ? sheetInteractOpen : false;

	// Manual collapse state prevents auto-expanding while the user has manually minimized
	const [manuallyCollapsed, setManuallyCollapsed] = useState(false);

	// Centralized sheet control to ensure consistent behavior
	const setSheetState = (next: boolean, openInputs = false) => {
		try {
			window.localStorage.setItem('nsu-wayfinder:sheet-expanded', JSON.stringify(next));
		} catch {}
		setSheetExpanded(next);
		setManuallyCollapsed(!next);
		if (next && openInputs) {
			setDestOpen(true);
			setTimeout(() => destInputRef.current?.focus(), 220);
		}
		if (!next) {
			setDestOpen(false);
			setOriginOpen(false);
		}
	};

	// Full-screen search overlay visible only while typing on mobile
	const overlayVisible = isMobile && destOpen && destQuery.trim().length > 0;
	useEffect(() => {
		if (overlayVisible && !manuallyCollapsed) {
			setSheetState(true, true);
		}
	}, [overlayVisible, manuallyCollapsed]);

	// If a route is (re)created, ensure any collapsed UI is restored
	useEffect(() => {
		if (route.destination) setRouteCollapsed(false);
	}, [route.destination]);

	// ═════════════════════════════════════════════════════════════════
	return (
		<div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', userSelect: 'none', background: c.bg }}>
			{showInitialLoading && (
				<div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: isDark ? 'rgba(5, 10, 20, 0.97)' : 'rgba(248, 250, 252, 0.97)' }}>
					<div style={glassStyle(isDark, { width: 'min(92vw, 380px)', padding: '24px 22px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 })}>
						<div style={{ width: 60, height: 60, borderRadius: 18, background: `linear-gradient(135deg, ${c.primary}, ${c.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, boxShadow: '0 10px 24px rgba(0,0,0,0.16)' }}>NSU</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: c.text }}>NSU Wayfinder</h1>
							<p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: sub }}>Preparing your campus map, routes, and indoor navigation experience.</p>
						</div>
						<div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
							{[0, 1, 2].map((dot) => (
								<div key={dot} style={{ width: 8, height: 8, borderRadius: '50%', background: c.primary, opacity: dot === 1 ? 0.95 : 0.4 }} />
							))}
						</div>
					</div>
				</div>
			)}
			{/* Full-bleed map */}
			<div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
				<MapCanvas isDark={isDark} pickingFromMap={!!pickMode} heading={hasCompass ? heading : null} gpsActive={gpsActive} trackingEnabled={trackingEnabled} />
			</div>

			{/* Full-screen dim overlay shown while typing search on mobile */}
			{overlayVisible && (
				<div
					onClick={() => {
						setDestOpen(false);
						// optionally collapse sheet
						setSheetState(false);
					}}
					style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 30 }}
				/>
			)}

			{/* Compact floating search pill when collapsed */}
			{isMobile && !sheetVisible && !destOpen && !originOpen && (
				<div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: searchTop, zIndex: 45, pointerEvents: 'all' }}>
					<button
						onClick={() => {
							setSheetState(true, true);
							if (navigator.vibrate) navigator.vibrate(6);
						}}
						style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.95)', boxShadow: DESIGN_TOKENS.shadow.md, border: '1px solid rgba(0,0,0,0.06)' }}
					>
						<Search size={16} color={c.primary} />
						<span style={{ fontWeight: 700, color: c.text }}>Tap to search</span>
						<ChevronRight size={14} style={{ transform: 'rotate(-90deg)', color: c.primary }} />
					</button>
				</div>
			)}

			{/* ── Admin banner ──────────────────────────────────────────── */}
			{isAdminMode && (
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						zIndex: 100,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 8,
						padding: '8px 16px',
						background: 'rgba(251,146,60,0.93)',
						backdropFilter: 'blur(12px)',
						borderBottom: '1px solid rgba(251,146,60,0.4)',
					}}
				>
					<AlertTriangle size={14} color="#7c2d12" />
					<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7c2d12' }}>Admin Mode — not for public use</span>
				</div>
			)}

			{/* ═══ SEARCH PANEL ══════════════════════════════════════════ */}
			<div
				ref={panelRef}
				style={{
					position: 'absolute',
					left: isMobile ? 12 : searchLeft,
					right: isMobile ? 12 : undefined,
					top: searchTop,
					width: isMobile ? 'calc(100vw - 24px)' : searchWidth,
					zIndex: 45,
					display: 'flex',
					flexDirection: 'column',
					gap: 12,
					paddingTop: isMobile ? 0 : 'env(safe-area-inset-top, 8px)',
					paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 8px)' : 0,
					pointerEvents: 'none',
				}}
			>
				{/* Glass card */}
				<div
					style={glassStyle(isDark, {
						padding: isMobile ? '10px 10px 12px' : '12px 8px 8px',
						borderRadius: isMobile ? '20px 20px 0 0' : 16,
						boxShadow: isMobile ? `0 -12px 30px ${isDark ? 'rgba(74, 158, 255, 0.15)' : 'rgba(0, 61, 165, 0.12)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` : DESIGN_TOKENS.shadow.lg,
						maxHeight: isMobile ? (sheetVisible ? '82dvh' : '30dvh') : 'none',
						overflow: 'hidden',
						pointerEvents: 'all',
						transition: 'max-height 240ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.16, 1, 0.3, 1)',
						transform: isMobile && !sheetVisible ? 'translateY(-110%)' : 'translateY(0)',
					})}
				>
					{isMobile && (
						<div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
							<div
								role="button"
								onClick={() => {
									setSheetState(!sheetVisible, !sheetVisible);
								}}
								onTouchStart={onHandleTouchStart}
								onTouchMove={onHandleTouchMove}
								onTouchEnd={onHandleTouchEnd}
								style={{ width: 44, height: 5, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)', touchAction: 'pan-y' }}
							/>
						</div>
					)}
					{/* Brand header */}
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 10px' }}>
						<div
							style={{
								width: 28,
								height: 28,
								borderRadius: 8,
								flexShrink: 0,
								background: c.primary,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<MapPin size={14} color="#fff" />
						</div>

						{/* Tracking pill + sheet toggle — right-aligned */}
						<div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
							<button
								title={trackingEnabled ? (gpsActive ? 'GPS active' : 'Sensor tracking (GPS unavailable)') : 'Start location tracking'}
								onClick={() => setTrackingEnabled(!trackingEnabled)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 5,
									padding: '4px 8px',
									borderRadius: 20,
									border: 'none',
									cursor: 'pointer',
									background: trackingEnabled ? (gpsActive ? 'rgba(16,185,129,0.15)' : 'rgba(37,99,235,0.12)') : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
									transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = trackingEnabled ? (gpsActive ? 'rgba(16,185,129,0.22)' : 'rgba(37,99,235,0.18)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = trackingEnabled ? (gpsActive ? 'rgba(16,185,129,0.15)' : 'rgba(37,99,235,0.12)') : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
								}}
							>
								<Radio size={11} color={trackingEnabled ? (gpsActive ? '#10b981' : '#2563eb') : faint} style={{ animation: trackingEnabled ? 'glow-ping 2s ease infinite' : 'none' }} />
								<span
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: trackingEnabled ? (gpsActive ? '#10b981' : '#2563eb') : faint,
									}}
								>
									{trackingEnabled ? (gpsActive ? 'GPS' : 'Sensor') : 'Tracking off'}
								</span>
							</button>
							<button
								title={sheetVisible ? 'Minimize search panel' : 'Open search panel'}
								onClick={() => setSheetState(!sheetVisible, !sheetVisible)}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 6,
									padding: '6px 10px',
									borderRadius: 999,
									border: 'none',
									cursor: 'pointer',
									background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
									color: c.text,
									fontSize: 11,
									fontWeight: 700,
									transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
								}}
							>
								<ChevronRight size={14} style={{ transform: `rotate(${sheetVisible ? 90 : -90}deg)`, transition: 'transform 200ms cubic-bezier(0.2,0,0.2,1)' }} />
								{sheetVisible ? 'Hide' : 'Search'}
							</button>
						</div>
					</div>

					{/* Quick actions */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px 8px' }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
							<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint }}>Quick places</span>
							{favoriteFeatureObjects.length > 0 && <span style={{ fontSize: 11, color: sub }}>{favoriteFeatureObjects.length} saved</span>}
						</div>
						<div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
							{quickDestinations.map((feature: any) => (
								<button
									key={feature.properties?._feature_id || feature.properties?.node_id}
									onClick={() => selectFeatureDestination(feature)}
									style={{
										...glassStyle(isDark, {
											padding: '8px 12px',
											borderRadius: 999,
											boxShadow: 'none',
										}),
										border: 'none',
										cursor: 'pointer',
										whiteSpace: 'nowrap',
										fontSize: 12,
										fontWeight: 600,
										color: text,
									}}
								>
									{feature.properties?.name || 'Place'}
								</button>
							))}
						</div>
						{favoriteFeatureObjects.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint }}>Favorites</span>
								<div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
									{favoriteFeatureObjects.map((feature: any) => (
										<FavoriteChip key={feature.properties?._feature_id || feature.properties?.node_id} feature={feature} />
									))}
								</div>
							</div>
						)}
						{recentFeatureObjects.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint }}>Recent</span>
								<div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
									{recentFeatureObjects.map((feature: any) => (
										<button
											key={feature.properties?._feature_id || feature.properties?.node_id}
											onClick={() => selectFeatureDestination(feature)}
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 8,
												padding: '8px 12px',
												borderRadius: 999,
												border: 'none',
												cursor: 'pointer',
												background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
												color: text,
												whiteSpace: 'nowrap',
												fontSize: 12,
												fontWeight: 600,
											}}
										>
											<Clock size={13} color={sub} />
											<span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{feature.properties?.name || 'Place'}</span>
										</button>
									))}
								</div>
							</div>
						)}
					</div>

					{/* ── Origin input row ───────────────────────────────────── */}
					<div style={{ position: 'relative' }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '12px 12px 12px 14px',
								borderRadius: 14,
								background: originOpen ? (isDark ? 'rgba(74, 158, 255, 0.12)' : 'rgba(0, 61, 165, 0.06)') : 'transparent',
								border: originOpen ? `1px solid ${isDark ? 'rgba(74, 158, 255, 0.25)' : 'rgba(0, 61, 165, 0.12)'}` : '1px solid transparent',
								transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
							}}
						>
							{/* Blue dot */}
							<div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
								<div style={{ width: 13, height: 13, borderRadius: '50%', background: '#2563eb', border: '2.5px solid #fff', boxShadow: '0 2px 6px rgba(37,99,235,0.4)', zIndex: 1 }} />
								{pickMode && <div style={{ position: 'absolute', width: 26, height: 26, borderRadius: '50%', background: 'rgba(37,99,235,0.25)', animation: 'glow-ping 1.6s ease infinite' }} />}
							</div>

							<input
								ref={originInputRef}
								type="text"
								placeholder={pickMode === 'origin' ? 'Tap the map to set start…' : 'Your starting point'}
								value={originQuery}
								onChange={(e) => {
									setOriginQuery(e.target.value);
									setOriginOpen(true);
									setDestOpen(false);
									setPickMode(false);
								}}
								onFocus={() => {
									if (pickMode !== 'origin') {
										setOriginOpen(true);
										setDestOpen(false);
									}
								}}
								onKeyDown={onOriginKey}
								style={{
									flex: 1,
									minWidth: 0,
									background: 'transparent',
									border: 'none',
									outline: 'none',
									fontSize: 15,
									fontWeight: 500,
									color: text,
									caretColor: '#2563eb',
									fontFamily: 'inherit',
									padding: '2px 0',
								}}
							/>

							{/* Pick-from-map button */}
							<button
								title={pickMode === 'origin' ? 'Cancel' : 'Pick location from map'}
								onClick={() => {
									setPickMode((p) => (p === 'origin' ? false : 'origin'));
									setOriginOpen(false);
								}}
								style={{
									width: 34,
									height: 34,
									borderRadius: 10,
									flexShrink: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: pickMode === 'origin' ? '#2563eb' : hov,
									color: pickMode === 'origin' ? '#fff' : sub,
									border: 'none',
									cursor: 'pointer',
									transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
								}}
							>
								<MapPin size={15} />
							</button>

							{/* Clear origin */}
							{hasOrigin && pickMode !== 'origin' && (
								<button
									onClick={() => {
										setRawOrigin(null);
										setOrigin(null);
										setOriginQuery('');
									}}
									style={{
										width: 34,
										height: 34,
										borderRadius: 10,
										flexShrink: 0,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: hov,
										color: sub,
										border: 'none',
										cursor: 'pointer',
										transition: 'background 0.15s ease',
									}}
								>
									<X size={14} />
								</button>
							)}
						</div>

						{/* Origin dropdown */}
						{originOpen && (
							<div
								style={{
									...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: isMobile ? 180 : 220, overflowY: 'auto' }),
									animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
								}}
							>
								<DropItem
									name="Pick location from map"
									sub="Tap the map to set starting point"
									type="pick-map"
									isActive={originIdx === -1}
									onHover={() => setOriginIdx(-1)}
									onClick={() => {
										setPickMode('origin');
										setOriginOpen(false);
									}}
								/>
								{filteredOrigin.map((p, i) => (
									<DropItem key={p.properties?._feature_id || i} name={p.properties?.name || ''} sub={`${p.properties?.building || p.properties?.type} · Level ${p.properties?.level}`} type={p.properties?.type} category={p.properties?.category} transitType={p.properties?.transit_type} isActive={originIdx === i} onHover={() => setOriginIdx(i)} onClick={() => selectOrigin(p)} />
								))}
							</div>
						)}
					</div>

					{/* Connector dots + Flip Button */}
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', height: 24, padding: '2px 20px' }}>
						<div style={{ position: 'absolute', left: 26.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
							{[0, 1, 2].map((i) => (
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
							onMouseEnter={(e) => {
								e.currentTarget.style.color = text;
								e.currentTarget.style.transform = 'scale(1.1)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = sub;
								e.currentTarget.style.transform = 'scale(1)';
							}}
						>
							<ArrowUpDown size={13} />
						</button>
					</div>

					{/* ── Destination input row ─────────────────────────────── */}
					<div style={{ position: 'relative' }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '12px 12px 12px 14px',
								borderRadius: 14,
								background: destOpen ? (isDark ? 'rgba(74, 158, 255, 0.12)' : 'rgba(0, 61, 165, 0.06)') : 'transparent',
								border: destOpen ? `1px solid ${isDark ? 'rgba(74, 158, 255, 0.25)' : 'rgba(0, 61, 165, 0.12)'}` : '1px solid transparent',
								transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
							}}
						>
							<div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
								<Search size={17} color={sub} />
							</div>
							<input
								ref={destInputRef}
								type="text"
								placeholder={pickMode === 'dest' ? 'Tap the map to set destination…' : 'Where do you want to go?'}
								value={destQuery}
								onChange={(e) => {
									setDestQuery(e.target.value);
									setDestOpen(true);
									setOriginOpen(false);
									setDestIdx(-1);
									setPickMode(false);
								}}
								onFocus={() => {
									if (pickMode !== 'dest') {
										setDestOpen(true);
										setOriginOpen(false);
									}
								}}
								onKeyDown={onDestKey}
								style={{
									flex: 1,
									minWidth: 0,
									background: 'transparent',
									border: 'none',
									outline: 'none',
									fontSize: 15,
									fontWeight: 500,
									color: text,
									caretColor: '#2563eb',
									fontFamily: 'inherit',
									padding: '2px 0',
								}}
							/>
							{/* Pick-from-map button for dest */}
							<button
								title={pickMode === 'dest' ? 'Cancel' : 'Pick location from map'}
								onClick={() => {
									setPickMode((p) => (p === 'dest' ? false : 'dest'));
									setDestOpen(false);
								}}
								style={{
									width: 34,
									height: 34,
									borderRadius: 10,
									flexShrink: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: pickMode === 'dest' ? '#2563eb' : hov,
									color: pickMode === 'dest' ? '#fff' : sub,
									border: 'none',
									cursor: 'pointer',
									transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
								}}
							>
								<MapPin size={15} />
							</button>
							{(destQuery || route.destination) && pickMode !== 'dest' && (
								<button
									onClick={() => {
										setDestination(null);
										setRouteCoordinates([]);
										setDestQuery('');
										setDestOpen(false);
										setDestIdx(-1);
									}}
									style={{
										width: 34,
										height: 34,
										borderRadius: 10,
										flexShrink: 0,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: hov,
										color: sub,
										border: 'none',
										cursor: 'pointer',
									}}
								>
									<X size={14} />
								</button>
							)}
							{route.destination && route.destination !== '' && (
								<button
									title={route.destination && favoriteDestinations.includes(route.destination) ? 'Remove from favorites' : 'Save to favorites'}
									onClick={() => route.destination && toggleFavoriteDestination(route.destination)}
									style={{
										width: 34,
										height: 34,
										borderRadius: 10,
										flexShrink: 0,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: favoriteDestinations.includes(route.destination) ? 'rgba(245,158,11,0.14)' : hov,
										color: favoriteDestinations.includes(route.destination) ? '#f59e0b' : sub,
										border: 'none',
										cursor: 'pointer',
									}}
								>
									<Star size={14} fill={favoriteDestinations.includes(route.destination) ? '#f59e0b' : 'none'} />
								</button>
							)}
						</div>

						{/* Destination dropdown */}
						{destOpen && (
							<div
								style={{
									...glassStyle(isDark, { padding: '6px', position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50, maxHeight: isMobile ? 200 : 264, overflowY: 'auto' }),
									animation: 'dropdown-in 0.18s cubic-bezier(0.34,1.26,0.64,1) forwards',
								}}
							>
								<DropItem
									name="Pick location from map"
									sub="Tap the map to set destination point"
									type="pick-map"
									isActive={destIdx === -1}
									onHover={() => setDestIdx(-1)}
									onClick={() => {
										setPickMode('dest');
										setDestOpen(false);
									}}
								/>
								{recentFeatureObjects.length > 0 && (
									<div style={{ padding: '4px 10px 8px' }}>
										<div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: '4px 2px 8px' }}>Recent destinations</div>
										<div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
											{recentFeatureObjects.map((feature: any) => (
												<button
													key={feature.properties?._feature_id || feature.properties?.node_id}
													onClick={() => selectFeatureDestination(feature)}
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														gap: 6,
														padding: '8px 10px',
														borderRadius: 999,
														border: 'none',
														cursor: 'pointer',
														background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
														color: text,
														whiteSpace: 'nowrap',
														fontSize: 12,
														fontWeight: 600,
													}}
												>
													<Clock size={12} color={sub} />
													<span>{feature.properties?.name || 'Place'}</span>
												</button>
											))}
										</div>
									</div>
								)}
								{favoriteFeatureObjects.length > 0 && (
									<div style={{ padding: '4px 10px 8px' }}>
										<div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: '4px 2px 8px' }}>Favorites</div>
										<div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
											{favoriteFeatureObjects.map((feature: any) => (
												<FavoriteChip key={feature.properties?._feature_id || feature.properties?.node_id} feature={feature} />
											))}
										</div>
									</div>
								)}
								{filteredDest.map((poi, i) => (
									<DropItem key={poi.properties?._feature_id} name={poi.properties?.name || ''} sub={`${poi.properties?.building} · Level ${poi.properties?.level}`} type={poi.properties?.type} category={poi.properties?.category} isActive={destIdx === i} onHover={() => setDestIdx(i)} onClick={() => selectDest(poi)} />
								))}
							</div>
						)}
					</div>

					{/* Bottom inner spacing */}
					<div style={{ height: 2 }} />
				</div>

				{/* Minimize / expand toggle for search sheet */}
				<button title={sheetVisible ? 'Minimize search' : 'Open search'} onClick={() => setSheetState(!sheetVisible, !sheetVisible)} style={{ width: 36, height: 36, marginLeft: 8, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov, color: sub, border: 'none', cursor: 'pointer' }}>
					<ChevronRight size={16} style={{ transform: `rotate(${sheetVisible ? 90 : -90}deg)` }} />
				</button>

				{/* Loading badge */}
				{isLoading && (
					<div style={glassStyle(isDark, { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', alignSelf: 'flex-start' })}>
						<div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'glow-ping 1.2s ease infinite' }} />
						<span style={{ fontSize: 12, fontWeight: 500, color: sub }}>Loading floor plan…</span>
					</div>
				)}
			</div>

			{/* ═══ RECENTER BUTTON (BOTTOM RIGHT, ALIGNED WITH SUMMARY) ═══ */}
			<button
				title="Recenter map to campus"
				onClick={() => {
					if (typeof window !== 'undefined' && (window as any).recenterMap) {
						(window as any).recenterMap();
					}
				}}
				style={{
					position: 'absolute',
					bottom: hasRoute && !routeCollapsed ? 0 : isMobile ? 112 : 64,
					right: 12,
					zIndex: 40,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 8,
					padding: '9px 13px',
					borderRadius: 999,
					cursor: 'pointer',
					border: 'none',
					background: `linear-gradient(135deg, ${c.primary}, ${c.accent})`,
					color: '#fff',
					transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
					fontWeight: 700,
					fontSize: 13,
					whiteSpace: 'nowrap',
					lineHeight: 1,
					boxShadow: `0 8px 20px ${isDark ? 'rgba(74, 158, 255, 0.28)' : 'rgba(0, 61, 165, 0.16)'}`,
				}}
				onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)')}
				onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0) scale(1)')}
			>
				<div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
					<Crosshair size={15} />
				</div>
				<span>Recenter</span>
			</button>

			{/* ═══ COMPACT BOTTOM-LEFT CONTROLS ═════════════════════════ */}
			{(!hasRoute || routeCollapsed) && (
				<div
					style={{
						position: 'absolute',
						left: controlBarLeft,
						bottom: controlBarBottom,
						zIndex: 40,
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						paddingBottom: 'env(safe-area-inset-bottom, 0px)',
						pointerEvents: 'all',
					}}
				>
					<div style={glassStyle(isDark, { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, boxShadow: `0 8px 24px ${isDark ? 'rgba(74, 158, 255, 0.2)' : 'rgba(0, 61, 165, 0.12)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` })}>
						<button
							title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
							onClick={() => setIsDark((d) => !d)}
							style={{
								width: 36,
								height: 36,
								borderRadius: 999,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								cursor: 'pointer',
								border: 'none',
								background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
								color: isDark ? '#fbbf24' : '#f59e0b',
								transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
							}}
							onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
							onMouseLeave={(e) => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')}
						>
							{isDark ? <Sun size={17} /> : <Moon size={17} />}
						</button>

						<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
							{([2, 1] as Level[]).map((lvl) => (
								<button
									key={lvl}
									onClick={() => setActiveLevel(lvl)}
									style={{
										minWidth: 34,
										height: 34,
										borderRadius: 999,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										padding: '0 10px',
										cursor: 'pointer',
										border: 'none',
										background: activeLevel === lvl ? c.primary : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
										color: activeLevel === lvl ? '#ffffff' : c.secondary,
										fontFamily: 'inherit',
										fontWeight: 700,
										fontSize: 12,
										transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
										boxShadow: activeLevel === lvl ? `0 4px 12px ${isDark ? 'rgba(74, 158, 255, 0.3)' : 'rgba(0, 61, 165, 0.2)'}` : 'none',
									}}
									onMouseEnter={(e) => {
										if (activeLevel !== lvl) {
											e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
										}
									}}
									onMouseLeave={(e) => {
										if (activeLevel !== lvl) {
											e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
										}
									}}
								>
									L{lvl}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{/* ═══ BOTTOM ROUTE SHEET ════════════════════════════════════ */}
			{hasRoute && routeStats && !routeCollapsed && (
				<div
					style={{
						position: 'absolute',
						bottom: 0,
						left: 0,
						right: 0,
						zIndex: 40,
						display: 'flex',
						justifyContent: 'center',
						padding: isMobile ? '12px 12px 0' : '12px 16px 24px',
						paddingBottom: 'env(safe-area-inset-bottom, 0px)',
						pointerEvents: 'none',
					}}
				>
					<div
						style={{
							...glassStyle(isDark, {
								width: '100%',
								maxWidth: isMobile ? '100%' : 420,
								animation: 'sheet-up 0.42s cubic-bezier(0.16,1,0.3,1) forwards',
								pointerEvents: 'all',
								padding: 0,
								borderRadius: isMobile ? '20px 20px 0 0' : 16,
								boxShadow: `0 16px 40px ${isDark ? 'rgba(74, 158, 255, 0.25)' : 'rgba(0, 61, 165, 0.18)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
							}),
						}}
					>
						{/* Drag handle */}
						<div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
							<div style={{ width: 40, height: 5, borderRadius: 3, background: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)' }} />
						</div>

						{/* Destination header */}
						<div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px 16px' }}>
							<div
								style={{
									width: 48,
									height: 48,
									borderRadius: 14,
									flexShrink: 0,
									background: c.primary,
									boxShadow: `0 4px 16px ${isDark ? 'rgba(74, 158, 255, 0.3)' : 'rgba(0, 61, 165, 0.2)'}`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									color: '#fff',
								}}
							>
								<Route size={22} />
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: faint, marginBottom: 2 }}>Navigating to</div>
								<div style={{ fontSize: 16, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{routeStats.destName}</div>
							</div>
							<button
								onClick={() => {
									// Hide the route sheet but keep route data so it can be restored
									setRouteCollapsed(true);
								}}
								style={{
									width: 34,
									height: 34,
									borderRadius: 10,
									flexShrink: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: hov,
									color: sub,
									border: 'none',
									cursor: 'pointer',
									transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
									e.currentTarget.style.color = c.secondary;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = hov;
									e.currentTarget.style.color = sub;
								}}
							>
								<X size={15} style={{ transition: 'transform 200ms cubic-bezier(0.2,0,0.2,1)' }} />
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
										{routeStats.mins > 0 && (
											<>
												{routeStats.mins}
												<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2, marginRight: 6 }}>min</span>
											</>
										)}
										{routeStats.secs}
										<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2 }}>sec</span>
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

			{/* Restore pill when user collapsed the route sheet (keeps route data) */}
			{hasRoute && routeCollapsed && routeStats && (
				<div style={{ position: 'absolute', left: 12, bottom: isMobile ? 112 : 64, zIndex: 50, pointerEvents: 'all' }}>
					<button
						onClick={() => setRouteCollapsed(false)}
						style={{
							...glassStyle(isDark, {
								padding: '8px 12px',
								borderRadius: 999,
								boxShadow: `0 6px 16px ${isDark ? 'rgba(74, 158, 255, 0.2)' : 'rgba(0, 61, 165, 0.12)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
								transition: 'all 200ms cubic-bezier(0.2,0,0.2,1)',
							}),
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							border: 'none',
							cursor: 'pointer',
						}}
						onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 8px 20px ${isDark ? 'rgba(74, 158, 255, 0.3)' : 'rgba(0, 61, 165, 0.18)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`)}
						onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 16px ${isDark ? 'rgba(74, 158, 255, 0.2)' : 'rgba(0, 61, 165, 0.12)'}, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`)}
					>
						<div style={{ width: 24, height: 24, borderRadius: 999, background: isDark ? 'rgba(74, 158, 255, 0.16)' : 'rgba(0, 61, 165, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.primary }}>
							<Route size={12} />
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
							<div style={{ fontSize: 12, color: faint }}>
								{routeStats.mins > 0 ? `${routeStats.mins}m ${routeStats.secs}s` : `${routeStats.secs}s`} · {routeStats.distStr}
							</div>
						</div>
					</button>
				</div>
			)}
		</div>
	);
}
