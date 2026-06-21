import React, { useCallback, useEffect, useMemo } from 'react'
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl/maplibre'
import type { MapMouseEvent } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../../store/useStore'
import type { Level } from '../../store/useStore'
import { GraduationCap, MapPin, ArrowUpDown, Info } from 'lucide-react'
import { nearestPointOnLine, point } from '@turf/turf'
import { computeShortestPath } from '../../lib/routing'

interface MapCanvasProps {
  isDark: boolean
  pickingFromMap?: boolean
}

// Custom Stairs SVG Icon
const StairsIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2.5"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M19 20H13V15H8V10H3V4" />
  </svg>
)


// Center coordinate of NSU complex
const NSU_CENTER = {
  longitude: 90.4263,
  latitude: 23.8152,
}

const INITIAL_VIEW_STATE = {
  longitude: NSU_CENTER.longitude,
  latitude: NSU_CENTER.latitude,
  zoom: 17.8,
  pitch: 0,
  bearing: 0,
}

// Map styles matching light/dark theme
const MAP_STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const MAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export const MapCanvas: React.FC<MapCanvasProps> = ({ isDark: isDarkMode, pickingFromMap = false }) => {
  const {
    activeLevel,
    setActiveLevel,
    features,
    isLoading,
    error,
    fetchFeatures,
    route,
    setOrigin,
    setRawOrigin,
    setRouteCoordinates,
  } = useStore()

  // Fetch features on mount
  useEffect(() => {
    fetchFeatures()
  }, [fetchFeatures])

  // Handle URL Parameter Parsing & Snapping — runs once after features load
  useEffect(() => {
    if (isLoading || features.length === 0) return

    const params = new URLSearchParams(window.location.search)
    const latParam = params.get('lat')
    const lngParam = params.get('lng') || params.get('lon') || params.get('longitude')
    const levelParam = params.get('level')

    if (!latParam || !lngParam) return

    const rawLat = parseFloat(latParam)
    const rawLng = parseFloat(lngParam)
    const rawLevel = levelParam ? (parseInt(levelParam) as Level) : (1 as Level)

    if (isNaN(rawLat) || isNaN(rawLng)) return

    setRawOrigin([rawLng, rawLat])
    setActiveLevel(rawLevel)

    const levelPaths = features.filter(
      (f) => f.geometry && f.properties?.type === 'path' && f.properties?.level === rawLevel
    )
    if (levelPaths.length > 0) {
      try {
        const pt = point([rawLng, rawLat])
        let minDist = Infinity
        let snapped: [number, number] | null = null
        for (const pf of levelPaths) {
          const s = nearestPointOnLine(pf, pt)
          const d = s.properties?.dist ?? Infinity
          if (d < minDist) { minDist = d; snapped = s.geometry.coordinates as [number, number] }
        }
        if (snapped) setOrigin(snapped, rawLevel)
      } catch (e) { console.error('Turf snap error:', e) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, isLoading]) // intentionally omit setActiveLevel/setOrigin/setRawOrigin to prevent re-runs

  // Trigger pathfinding when origin and destination are selected
  useEffect(() => {
    console.log('MapCanvas Triggering pathfinding hook. isLoading:', isLoading, 'features:', features.length, 'origin:', route.origin, 'destination:', route.destination);
    if (isLoading || features.length === 0 || !route.origin || !route.destination) {
      if (route.routeCoordinates.length > 0) {
        setRouteCoordinates([])
      }
      return
    }

    // Find destination feature
    const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
    if (!destFeature || !destFeature.geometry || destFeature.geometry.type !== 'Point') return

    const destCoords = destFeature.geometry.coordinates as [number, number]
    const destLevel = destFeature.properties?.level as number
    const originLevel = route.originLevel || activeLevel

    const pathCoords = computeShortestPath(features, originLevel, route.origin, destLevel, destCoords)
    setRouteCoordinates(pathCoords)
  }, [
    features,
    isLoading,
    activeLevel,
    route.origin,
    route.originLevel,
    route.destination,
    setRouteCoordinates,
  ])

  // Filter features for the building footprint
  const footprintData = useMemo(() => {
    const filtered = features.filter(
      (f) => f.geometry && f.properties?.type === 'footprint' && f.properties?.level === activeLevel
    )
    return {
      type: 'FeatureCollection' as const,
      features: filtered,
    }
  }, [features, activeLevel])

  // Filter features for the paths
  const pathsData = useMemo(() => {
    const filtered = features.filter(
      (f) => f.geometry && f.properties?.type === 'path' && f.properties?.level === activeLevel
    )
    return {
      type: 'FeatureCollection' as const,
      features: filtered,
    }
  }, [features, activeLevel])

  // Filter POIs and Transits for markers (include cross-floor destination)
  const markersData = useMemo(() => {
    return features.filter((f) => {
      if (!f.geometry || f.geometry.type !== 'Point') return false
      const isTransitOrPoi = f.properties?.type === 'poi' || f.properties?.type === 'transit'
      if (!isTransitOrPoi) return false

      if (f.properties?.level === activeLevel) return true
      if (route.destination && f.properties?._feature_id === route.destination) return true

      return false
    })
  }, [features, activeLevel, route.destination])



  // Create LineString geometry linking raw URL entry to snapped corridor path point
  const startSnapLineData = useMemo(() => {
    if (
      !route.rawOrigin ||
      !route.origin ||
      !route.destination ||
      route.routeCoordinates.length === 0 ||
      route.originLevel !== activeLevel
    ) {
      return null
    }
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [route.rawOrigin, route.origin],
          },
          properties: {},
        },
      ],
    }
  }, [route.rawOrigin, route.origin, route.destination, route.routeCoordinates, route.originLevel, activeLevel])

  // Find destination level and coordinate
  const destInfo = useMemo(() => {
    if (!route.destination || features.length === 0) return null
    const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
    if (!destFeature || !destFeature.geometry || destFeature.geometry.type !== 'Point') return null
    return {
      coords: destFeature.geometry.coordinates as [number, number],
      level: destFeature.properties?.level as number
    }
  }, [features, route.destination])

  // Create LineString geometry for the destination snap line (walking path at the end)
  const destSnapLineData = useMemo(() => {
    if (!destInfo || !route.routeCoordinates || route.routeCoordinates.length === 0 || destInfo.level !== activeLevel) return null
    const lastRouteCoord = route.routeCoordinates[route.routeCoordinates.length - 1]
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [[lastRouteCoord[0], lastRouteCoord[1]], destInfo.coords],
          },
          properties: {},
        },
      ],
    }
  }, [destInfo, route.routeCoordinates, activeLevel])

  // Create LineString geometry for the active calculated route (filtered for active floor)
  const routeData = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null
    
    // Filter coordinates matching activeLevel
    const filteredCoords = route.routeCoordinates
      .filter((coord) => coord[2] === activeLevel)
      .map((coord) => [coord[0], coord[1]] as [number, number])

    if (filteredCoords.length < 2) return null

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: filteredCoords,
          },
          properties: {},
        },
      ],
    }
  }, [route.routeCoordinates, activeLevel])

  // Create LineString geometry for inactive floor route segments (overlaid dashed violet)
  const inactiveRouteData = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null

    // Collect consecutive segments that are NOT on the activeLevel
    // Build one or more LineString features per contiguous inactive segment
    const inactiveFeatures: any[] = []
    let currentSegment: [number, number][] = []

    for (let i = 0; i < route.routeCoordinates.length; i++) {
      const coord = route.routeCoordinates[i]
      const isInactive = coord[2] !== activeLevel
      if (isInactive) {
        currentSegment.push([coord[0], coord[1]])
      } else {
        if (currentSegment.length >= 2) {
          inactiveFeatures.push({
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: currentSegment },
            properties: {},
          })
        }
        currentSegment = []
      }
    }
    // flush last segment
    if (currentSegment.length >= 2) {
      inactiveFeatures.push({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: currentSegment },
        properties: {},
      })
    }

    if (inactiveFeatures.length === 0) return null

    return {
      type: 'FeatureCollection' as const,
      features: inactiveFeatures,
    }
  }, [route.routeCoordinates, activeLevel])

  // Detect floor level transition points
  const floorTransition = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null

    for (let i = 0; i < route.routeCoordinates.length - 1; i++) {
      const curr = route.routeCoordinates[i]
      const next = route.routeCoordinates[i + 1]
      if (curr[2] !== next[2]) {
        return {
          coords: [curr[0], curr[1]] as [number, number],
          fromLevel: curr[2] as Level,
          toLevel: next[2] as Level
        }
      }
    }
    return null
  }, [route.routeCoordinates])

  // MapLibre Layer Styles for Building Outlines
  const footprintLayerStyle: any = {
    id: 'building-footprint',
    type: 'fill',
    paint: {
      'fill-color': isDarkMode ? '#1e293b' : '#f1f5f9',
      'fill-opacity': 0.6,
      'fill-outline-color': isDarkMode ? '#475569' : '#cbd5e1',
    },
  }

  const footprintLineLayerStyle: any = {
    id: 'building-footprint-line',
    type: 'line',
    paint: {
      'line-color': isDarkMode ? '#3b82f6' : '#2563eb',
      'line-width': 2.5,
      'line-opacity': 0.8,
    },
  }

  // MapLibre Layer Styles for Paths
  const pathsLayerStyle: any = {
    id: 'corridor-paths',
    type: 'line',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': isDarkMode ? '#475569' : '#cbd5e1', // thin grey lines
      'line-width': 1.5,
      'line-opacity': 0.65,
    },
  }



  const startSnapLineLayerStyle: any = {
    id: 'start-snap-line-active',
    type: 'line',
    filter: ['!=', ['get', 'isInactive'], true],
    paint: {
      'line-color': '#2563eb', // blue color matching active You
      'line-width': 3,
      'line-dasharray': [2, 2],
      'line-opacity': 0.8,
    },
  }

  const startSnapLineInactiveLayerStyle: any = {
    id: 'start-snap-line-inactive',
    type: 'line',
    filter: ['==', ['get', 'isInactive'], true],
    paint: {
      'line-color': '#8b5cf6', // violet for inactive
      'line-width': 3,
      'line-dasharray': [3, 3],
      'line-opacity': 0.65,
    },
  }

  const destSnapLineLayerStyle: any = {
    id: 'dest-snap-line-active',
    type: 'line',
    filter: ['!=', ['get', 'isInactive'], true],
    paint: {
      'line-color': '#10b981', // emerald color matching active dest
      'line-width': 4,
      'line-dasharray': [2, 2],
      'line-opacity': 0.85,
    },
  }

  const destSnapLineInactiveLayerStyle: any = {
    id: 'dest-snap-line-inactive',
    type: 'line',
    filter: ['==', ['get', 'isInactive'], true],
    paint: {
      'line-color': '#8b5cf6', // violet for inactive
      'line-width': 4,
      'line-dasharray': [3, 3],
      'line-opacity': 0.65,
    },
  }

  const routeLayerStyle: any = {
    id: 'active-route',
    type: 'line',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#2563eb', // blue color for active route
      'line-width': 5,
      'line-opacity': 0.95,
    },
  }

  const inactiveRouteLayerStyle: any = {
    id: 'inactive-route',
    type: 'line',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#8b5cf6', // violet color for inactive route
      'line-width': 4,
      'line-dasharray': [3, 3],
      'line-opacity': 0.7,
    },
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md p-6 bg-card rounded-2xl border border-destructive/20 shadow-lg animate-in fade-in-50 duration-300">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mx-auto mb-4">
            <Info className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Map</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => fetchFeatures()}
            className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/95 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  // Map click handler for pick-from-map mode
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!pickingFromMap) return
    const { lng, lat } = e.lngLat
    document.dispatchEvent(new CustomEvent('map:pick-origin', {
      detail: { lng, lat, level: activeLevel }
    }))
  }, [pickingFromMap, activeLevel])

  return (
    <div className={`relative w-full h-full ${pickingFromMap ? 'cursor-crosshair' : ''}`}>
      {/* Loading state indicator */}
      {isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/90 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-md border border-border animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
          <span className="text-xs font-medium text-foreground">Syncing floor plan data...</span>
        </div>
      )}

      {/* Main Map Canvas */}
      <Map
        mapLib={maplibregl}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={isDarkMode ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        style={{ width: '100%', height: '100%' }}
        maxZoom={21}
        minZoom={16}
        attributionControl={false}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Building Footprint (Polygons) */}
        {footprintData.features.length > 0 && (
          <Source id="building-footprint-source" type="geojson" data={footprintData}>
            <Layer {...footprintLayerStyle} />
            <Layer {...footprintLineLayerStyle} />
          </Source>
        )}

        {/* Corridor Path Mesh (LineStrings) */}
        {pathsData.features.length > 0 && (
          <Source id="corridor-paths-source" type="geojson" data={pathsData}>
            <Layer {...pathsLayerStyle} />
          </Source>
        )}

        {/* Dotted snap line from You marker to start of route on path */}
        {startSnapLineData && (
          <Source id="start-snap-line-source" type="geojson" data={startSnapLineData}>
            <Layer {...startSnapLineLayerStyle} />
            <Layer {...startSnapLineInactiveLayerStyle} />
          </Source>
        )}

        {/* Active calculated route */}
        {routeData && (
          <Source id="active-route-source" type="geojson" data={routeData}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {/* Inactive calculated route (overlaid) */}
        {inactiveRouteData && (
          <Source id="inactive-route-source" type="geojson" data={inactiveRouteData}>
            <Layer {...inactiveRouteLayerStyle} />
          </Source>
        )}

        {/* Dotted snap line from end of route to destination POI */}
        {destSnapLineData && (
          <Source id="dest-snap-line-source" type="geojson" data={destSnapLineData}>
            <Layer {...destSnapLineLayerStyle} />
            <Layer {...destSnapLineInactiveLayerStyle} />
          </Source>
        )}

        {/* Visitor Origin Marker (You) */}
        {(route.rawOrigin || route.origin) && (
          <Marker 
            longitude={route.rawOrigin ? route.rawOrigin[0] : route.origin![0]} 
            latitude={route.rawOrigin ? route.rawOrigin[1] : route.origin![1]} 
            anchor="center"
            style={{ zIndex: 9999 }}
          >
            <div 
              style={{ opacity: route.originLevel !== activeLevel ? 0.6 : 1 }}
              className="flex flex-col items-center select-none pointer-events-none animate-in fade-in zoom-in duration-300 relative z-[9999]"
            >
              <div 
                style={{
                  color: '#2563eb',
                  textShadow: isDarkMode 
                    ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                    : '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff'
                }}
                className="mb-1 text-[10px] font-black tracking-wider uppercase whitespace-nowrap"
              >
                You {route.originLevel !== activeLevel && `(L${route.originLevel})`}
              </div>
              <div className="w-4.5 h-4.5 rounded-full bg-blue-600 border-[2.5px] border-white flex items-center justify-center shadow-lg relative">
                {route.originLevel === activeLevel && (
                  <span className="absolute w-full h-full rounded-full bg-blue-500/50 animate-ping" />
                )}
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          </Marker>
        )}

        {/* POIs and Transit Nodes (Markers) */}
        {markersData.map((marker) => {
          const [lng, lat] = marker.geometry.coordinates
          const { type, category, name, transit_type, node_id, level } = marker.properties || {}
          const key = node_id || marker.properties?._feature_id || `${lng}-${lat}`

          const isTransit = type === 'transit'
          const isClassroom = category === 'classroom'
          const isInactiveFloor = level !== activeLevel

          const isRouteActive = !!route.destination
          const isDestination = route.destination && (marker.properties?._feature_id === route.destination || node_id === route.destination)
          const showIcon = !isRouteActive || isDestination

          const labelColor = isTransit ? '#10b981' : isClassroom ? '#6366f1' : '#f43f5e'
          const textShadowStyle = isDarkMode
            ? '-1.2px -1.2px 0 #000, 1.2px -1.2px 0 #000, -1.2px 1.2px 0 #000, 1.2px 1.2px 0 #000'
            : '-1.2px -1.2px 0 #fff, 1.2px -1.2px 0 #fff, -1.2px 1.2px 0 #fff, 1.2px 1.2px 0 #fff'

          return (
            <Marker key={key} longitude={lng} latitude={lat} anchor="bottom">
              <div 
                style={{ opacity: isInactiveFloor ? 0.6 : 1 }}
                className="group flex flex-col items-center cursor-default"
              >
                {/* Outlined Label without Background */}
                <div 
                  style={{
                    color: labelColor,
                    textShadow: textShadowStyle
                  }}
                  className="mb-1 text-[9.5px] font-extrabold tracking-wide whitespace-nowrap opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none"
                >
                  {name || 'POI'} {isInactiveFloor && `(L${level})`}
                </div>

                {/* Marker Pin */}
                {showIcon && (
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-background transition-transform duration-200 group-hover:scale-110 ${
                      isTransit
                        ? 'bg-emerald-500 text-white'
                        : isClassroom
                        ? 'bg-indigo-500 text-white'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {isTransit ? (
                      transit_type === 'staircase' ? (
                        <StairsIcon className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      )
                    ) : isClassroom ? (
                      <GraduationCap className="w-3.5 h-3.5" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                  </div>
                )}
              </div>
            </Marker>
          )
        })}
      </Map>
    </div>
  )
}
