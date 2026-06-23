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
  heading?: number | null      // compass heading 0-360, 0=north CW
  gpsActive?: boolean          // whether GPS is live
  trackingEnabled?: boolean    // whether sensor tracking is on
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

export const MapCanvas: React.FC<MapCanvasProps> = ({
  isDark: isDarkMode,
  pickingFromMap = false,
  heading = null,
  gpsActive = false,
}) => {
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



  // Trigger pathfinding when origin and destination are selected
  useEffect(() => {
    console.log('MapCanvas Triggering pathfinding hook. isLoading:', isLoading, 'features:', features.length, 'origin:', route.origin, 'destination:', route.destination);
    if (isLoading || features.length === 0 || !route.origin || !route.destination) {
      if (route.routeCoordinates.length > 0) {
        setRouteCoordinates([])
      }
      return
    }

    let destCoords: [number, number]
    let destLevel: number

    if (route.destination.startsWith('coord:')) {
      const parts = route.destination.replace('coord:', '').split(',')
      destCoords = [parseFloat(parts[0]), parseFloat(parts[1])]
      destLevel = parseInt(parts[2], 10)
    } else {
      // Find destination feature
      const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
      if (!destFeature || !destFeature.geometry || destFeature.geometry.type !== 'Point') return
      destCoords = destFeature.geometry.coordinates as [number, number]
      destLevel = destFeature.properties?.level as number
    }

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



  // Helper: haversine distance between two coords
  const haversineDist = (a: [number, number], b: [number, number]): number => {
    const R = 6371e3
    const dLat = (b[1] - a[1]) * Math.PI / 180
    const dLon = (b[0] - a[0]) * Math.PI / 180
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
  }

  // Create LineString geometry linking YOU marker to the start of the calculated path
  // Show only when origin is on the active level
  const startSnapLineData = useMemo(() => {
    if (
      !route.routeCoordinates ||
      route.routeCoordinates.length === 0
    ) {
      return null
    }

    const youCoords = route.rawOrigin || route.origin
    if (!youCoords) return null

    const firstRouteCoord = route.routeCoordinates[0]
    const pathStartCoords = [firstRouteCoord[0], firstRouteCoord[1]] as [number, number]

    if (haversineDist(youCoords as [number, number], pathStartCoords) < 0.01) return null

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [youCoords, pathStartCoords],
          },
          properties: {},
        },
      ],
    }
  }, [route.rawOrigin, route.origin, route.routeCoordinates])

  // Find destination level and coordinate
  const destInfo = useMemo(() => {
    if (!route.destination) return null
    if (route.destination.startsWith('coord:')) {
      const parts = route.destination.replace('coord:', '').split(',')
      return {
        coords: [parseFloat(parts[0]), parseFloat(parts[1])] as [number, number],
        level: parseInt(parts[2], 10)
      }
    }
    if (features.length === 0) return null
    const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
    if (!destFeature || !destFeature.geometry || destFeature.geometry.type !== 'Point') return null
    return {
      coords: destFeature.geometry.coordinates as [number, number],
      level: destFeature.properties?.level as number
    }
  }, [features, route.destination])

  // Create LineString geometry for the destination snap line (last route point → dest POI)
  const destSnapLineData = useMemo(() => {
    if (!destInfo || !route.routeCoordinates || route.routeCoordinates.length === 0) return null
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
  }, [destInfo, route.routeCoordinates])

  // staircaseConnectorData removed — new routing.ts explicitly routes origin→staircase→dest
  // All route segments are encoded in route.routeCoordinates with level tags.

  // Build contiguous same-level segments from routeCoordinates
  function buildSegments(coords: [number, number, number][], forLevel: number | 'inactive'): [number, number][][] {
    const segments: [number, number][][] = []
    let current: [number, number][] = []
    for (const coord of coords) {
      const matches = forLevel === 'inactive' ? coord[2] !== activeLevel : coord[2] === forLevel
      if (matches) {
        current.push([coord[0], coord[1]])
      } else {
        if (current.length >= 2) segments.push(current)
        current = []
      }
    }
    if (current.length >= 2) segments.push(current)
    return segments
  }

  // Active floor route: one or more LineStrings for contiguous segments on activeLevel
  const routeData = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null
    const segments = buildSegments(route.routeCoordinates, activeLevel)
    if (segments.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: segments.map(seg => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: seg },
        properties: {},
      })),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.routeCoordinates, activeLevel])

  // Inactive floor route: all segments NOT on activeLevel (purple dashed)
  const inactiveRouteData = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null
    const segments = buildSegments(route.routeCoordinates, 'inactive')
    if (segments.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: segments.map(seg => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: seg },
        properties: {},
      })),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.routeCoordinates, activeLevel])


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
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#2563eb', // blue — same as active route
      'line-width': 3,
      'line-opacity': 0.8,
    },
  }

  const destSnapLineLayerStyle: any = {
    id: 'dest-snap-line-active',
    type: 'line',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#2563eb', // blue — consistent with active route
      'line-width': 4,
      'line-opacity': 0.85,
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

  // Map click handler for pick-from-map mode
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!pickingFromMap) return
    const { lng, lat } = e.lngLat
    document.dispatchEvent(new CustomEvent('map:pick-origin', {
      detail: { lng, lat, level: activeLevel }
    }))
  }, [pickingFromMap, activeLevel])

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

  const pinCursorUrl = `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSczMicgaGVpZ2h0PSczMicgdmlld0JveD0nMCAwIDI0IDI0JyBmaWxsPScjZjQzZjVlJyBzdHJva2U9JyNmZmZmZmYnIHN0cm9rZS13aWR0aD0nMicgc3Ryb2tlLWxpbmVqb2luPSdyb3VuZCcgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJz48cGF0aCBkPSJNMjAgMTBjMCA2LTggMTItOCAxMnMtOC02LTgtMTJhOCA4IDAgMCAxIDE2IDBaIi8+PGNpcmNsZSBjeD0nMTInIGN5PScxMCcgcj0nMycgZmlsbD0nI2ZmZmZmZicvPjwvc3ZnPg==") 16 32, crosshair`

  return (
    <div
      style={pickingFromMap ? { cursor: pinCursorUrl } : {}}
      className="relative w-full h-full"
    >
      {pickingFromMap && (
        <style>{`
          .maplibregl-canvas, .maplibregl-canvas-container {
            cursor: ${pinCursorUrl} !important;
          }
        `}</style>
      )}
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

        {/* Solid line from You marker to start of walkable path */}
        {startSnapLineData && (
          <Source id="start-snap-line-source" type="geojson" data={startSnapLineData}>
            {(route.originLevel || activeLevel) === activeLevel ? (
              <Layer key="start-snap-active" {...startSnapLineLayerStyle} />
            ) : (
              <Layer key="start-snap-inactive" {...inactiveRouteLayerStyle} id="start-snap-line-inactive" />
            )}
          </Source>
        )}

        {/* Active calculated route */}
        {routeData && (
          <Source id="active-route-source" type="geojson" data={routeData}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {/* Inactive calculated route (overlaid dashed violet) */}
        {inactiveRouteData && (
          <Source id="inactive-route-source" type="geojson" data={inactiveRouteData}>
            <Layer {...inactiveRouteLayerStyle} />
          </Source>
        )}

        {/* Solid line from end of walkable path to destination POI */}
        {destSnapLineData && (
          <Source id="dest-snap-line-source" type="geojson" data={destSnapLineData}>
            {destInfo && destInfo.level === activeLevel ? (
              <Layer key="dest-snap-active" {...destSnapLineLayerStyle} />
            ) : (
              <Layer key="dest-snap-inactive" {...inactiveRouteLayerStyle} id="dest-snap-line-inactive" />
            )}
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
              {/* YOU label */}
              <div
                style={{
                  color: '#2563eb',
                  textShadow: isDarkMode
                    ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                    : '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
                }}
                className="mb-1 text-[10px] font-black tracking-wider uppercase whitespace-nowrap"
              >
                You {route.originLevel !== activeLevel && `(L${route.originLevel})`}
              </div>

              {/* Dot + compass cone */}
              <div style={{ position: 'relative', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                {/* Compass heading cone — only when heading known */}
                {heading != null && route.originLevel === activeLevel && (
                  <div
                    style={{
                      position: 'absolute',
                      width: 0,
                      height: 0,
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      borderBottom: '22px solid rgba(37,99,235,0.55)',
                      bottom: '50%',
                      left: '50%',
                      transformOrigin: 'bottom center',
                      transform: `translateX(-50%) rotate(${heading}deg)`,
                      transition: 'transform 0.25s cubic-bezier(0.34,1.26,0.64,1)',
                      zIndex: 1,
                    }}
                  />
                )}

                {/* Accuracy ring (GPS active = solid, dead reckoning = dashed) */}
                {route.originLevel === activeLevel && (
                  <div
                    style={{
                      position: 'absolute',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      border: gpsActive
                        ? '1.5px solid rgba(37,99,235,0.35)'
                        : '1.5px dashed rgba(37,99,235,0.30)',
                      background: 'rgba(37,99,235,0.08)',
                    }}
                  />
                )}

                {/* Ping ring */}
                {route.originLevel === activeLevel && (
                  <span
                    style={{
                      position: 'absolute',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(59,130,246,0.45)',
                      animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
                    }}
                  />
                )}

                {/* Core blue dot */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#2563eb',
                    border: '2.5px solid #fff',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.55)',
                    position: 'relative',
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
                </div>
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
                style={{ opacity: isInactiveFloor ? 0.6 : 1, cursor: pickingFromMap ? 'pointer' : 'default' }}
                className="group flex flex-col items-center"
                onClick={(e) => {
                  if (pickingFromMap) {
                    e.stopPropagation()
                    document.dispatchEvent(new CustomEvent('map:pick-origin', {
                      detail: {
                        lng,
                        lat,
                        level,
                        featureId: marker.properties?._feature_id || node_id,
                        name: name || 'POI'
                      }
                    }))
                  }
                }}
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

        {/* Custom Coordinate Destination Marker */}
        {destInfo && route.destination?.startsWith('coord:') && (
          <Marker longitude={destInfo.coords[0]} latitude={destInfo.coords[1]} anchor="bottom">
            <div style={{ opacity: destInfo.level !== activeLevel ? 0.6 : 1 }} className="group flex flex-col items-center cursor-default">
              <div 
                style={{
                  color: '#f43f5e',
                  textShadow: isDarkMode
                    ? '-1.2px -1.2px 0 #000, 1.2px -1.2px 0 #000, -1.2px 1.2px 0 #000, 1.2px 1.2px 0 #000'
                    : '-1.2px -1.2px 0 #fff, 1.2px -1.2px 0 #fff, -1.2px 1.2px 0 #fff, 1.2px 1.2px 0 #fff'
                }}
                className="mb-1 text-[9.5px] font-extrabold tracking-wide whitespace-nowrap opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none"
              >
                Destination {destInfo.level !== activeLevel && `(L${destInfo.level})`}
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-background transition-transform duration-200 group-hover:scale-110 bg-rose-500 text-white">
                <MapPin className="w-3.5 h-3.5" />
              </div>
            </div>
          </Marker>
        )}
      </Map>
    </div>
  )
}
