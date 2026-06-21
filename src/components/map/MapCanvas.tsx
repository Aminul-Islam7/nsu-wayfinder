import React, { useEffect, useMemo, useState } from 'react'
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../../store/useStore'
import type { Level } from '../../store/useStore'
import { GraduationCap, MapPin, ArrowUpDown, Info } from 'lucide-react'
import { nearestPointOnLine, point } from '@turf/turf'
import { computeShortestPath } from '../../lib/routing'

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

export const MapCanvas: React.FC = () => {
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
    isAdminMode,
  } = useStore()

  const [isDarkMode, setIsDarkMode] = useState(false)

  // Detect dark mode from system preference or class name
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDarkMode(isDark)
  }, [])

  // Fetch features on mount
  useEffect(() => {
    fetchFeatures()
  }, [fetchFeatures])

  // Handle URL Parameter Parsing & Snapping
  useEffect(() => {
    if (isLoading || features.length === 0) return

    const params = new URLSearchParams(window.location.search)
    const latParam = params.get('lat')
    const lngParam = params.get('lng') || params.get('lon') || params.get('longitude')
    const levelParam = params.get('level')

    if (latParam && lngParam) {
      const rawLat = parseFloat(latParam)
      const rawLng = parseFloat(lngParam)
      const rawLevel = levelParam ? (parseInt(levelParam) as Level) : (1 as Level)

      if (!isNaN(rawLat) && !isNaN(rawLng)) {
        setRawOrigin([rawLng, rawLat])
        if (activeLevel !== rawLevel) {
          setActiveLevel(rawLevel)
        }

        // Find nearest path on this level
        const levelPaths = features.filter(
          (f) =>
            f.geometry &&
            f.properties?.type === 'path' &&
            f.properties?.level === rawLevel
        )

        if (levelPaths.length > 0) {
          try {
            const pt = point([rawLng, rawLat])
            let minDistance = Infinity
            let snappedCoord: [number, number] | null = null

            for (const pathFeature of levelPaths) {
              const snapped = nearestPointOnLine(pathFeature, pt)
              const dist = snapped.properties?.dist ?? Infinity
              if (dist < minDistance) {
                minDistance = dist
                snappedCoord = snapped.geometry.coordinates as [number, number]
              }
            }

            if (snappedCoord) {
              setOrigin(snappedCoord)
            }
          } catch (e) {
            console.error('Turf snapping error:', e)
          }
        }
      }
    }
  }, [features, isLoading, activeLevel, setActiveLevel, setOrigin, setRawOrigin])

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

    const pathCoords = computeShortestPath(features, activeLevel, route.origin, destCoords)
    setRouteCoordinates(pathCoords)
  }, [
    features,
    isLoading,
    activeLevel,
    route.origin,
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

  // Filter POIs and Transits for markers
  const markersData = useMemo(() => {
    return features.filter(
      (f) =>
        f.geometry &&
        f.geometry.type === 'Point' &&
        (f.properties?.type === 'poi' || f.properties?.type === 'transit') &&
        f.properties?.level === activeLevel
    )
  }, [features, activeLevel])



  // Find destination coordinate
  const destCoords = useMemo(() => {
    if (!route.destination || features.length === 0) return null
    const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
    if (!destFeature || !destFeature.geometry || destFeature.geometry.type !== 'Point') return null
    return destFeature.geometry.coordinates as [number, number]
  }, [features, route.destination])

  // Create LineString geometry for the destination snap line (walking path at the end)
  const destSnapLineData = useMemo(() => {
    if (!destCoords || !route.routeCoordinates || route.routeCoordinates.length === 0) return null
    const lastRouteCoord = route.routeCoordinates[route.routeCoordinates.length - 1]
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [lastRouteCoord, destCoords],
          },
          properties: {},
        },
      ],
    }
  }, [destCoords, route.routeCoordinates])

  // Create LineString geometry for the active calculated route
  const routeData = useMemo(() => {
    if (!route.routeCoordinates || route.routeCoordinates.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: route.routeCoordinates,
          },
          properties: {},
        },
      ],
    }
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



  const destSnapLineLayerStyle: any = {
    id: 'dest-snap-line',
    type: 'line',
    paint: {
      'line-color': '#10b981', // emerald color matching route
      'line-width': 4,
      'line-dasharray': [2, 2], // dashed walking line
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
      'line-color': '#10b981', // emerald color for active route
      'line-width': 6,
      'line-opacity': 0.9,
    },
  }

  const routeBorderLayerStyle: any = {
    id: 'active-route-border',
    type: 'line',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#ffffff', // white border to make route pop
      'line-width': 10,
      'line-opacity': 0.8,
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

  return (
    <div className="relative w-full h-full">
      {/* Loading state indicator */}
      {isLoading && (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-3 bg-background/90 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-md border border-border animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
          <span className="text-xs font-medium text-foreground">Syncing floor plan data...</span>
        </div>
      )}

      {/* Level Switcher (Floating HUD) */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
        <div className="bg-background/85 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-border flex flex-col gap-1">
          {( [2, 1] as Level[] ).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm transition-all duration-200 ${
                activeLevel === lvl
                  ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              L{lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Main Map Canvas */}
      <Map
        mapLib={maplibregl}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={isDarkMode ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        style={{ width: '100%', height: '100%' }}
        maxZoom={21}
        minZoom={16}
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

        {/* Active calculated route */}
        {routeData && (
          <Source id="active-route-source" type="geojson" data={routeData}>
            <Layer {...routeBorderLayerStyle} />
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {/* Dotted snap line from end of route to destination POI */}
        {destSnapLineData && (
          <Source id="dest-snap-line-source" type="geojson" data={destSnapLineData}>
            <Layer {...destSnapLineLayerStyle} />
          </Source>
        )}

        {/* Snapped Visitor Origin Marker (You) */}
        {route.origin && (
          <Marker 
            longitude={route.origin[0]} 
            latitude={route.origin[1]} 
            anchor="center"
            style={{ zIndex: 9999 }}
          >
            <div className="flex flex-col items-center select-none pointer-events-none animate-in fade-in zoom-in duration-300 relative z-[9999]">
              <div 
                style={{
                  color: '#2563eb',
                  textShadow: isDarkMode 
                    ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                    : '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff'
                }}
                className="mb-1 text-[10px] font-black tracking-wider uppercase whitespace-nowrap"
              >
                You
              </div>
              <div className="w-4.5 h-4.5 rounded-full bg-blue-600 border-[2.5px] border-white flex items-center justify-center shadow-lg relative">
                <span className="absolute w-full h-full rounded-full bg-blue-500/50 animate-ping" />
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          </Marker>
        )}

        {/* POIs and Transit Nodes (Markers) */}
        {markersData.map((marker) => {
          const [lng, lat] = marker.geometry.coordinates
          const { type, category, name, transit_type, node_id } = marker.properties || {}
          const key = node_id || marker.properties?._feature_id || `${lng}-${lat}`

          const isTransit = type === 'transit'
          const isClassroom = category === 'classroom'

          const labelColor = isTransit ? '#10b981' : isClassroom ? '#6366f1' : '#f43f5e'
          const textShadowStyle = isDarkMode
            ? '-1.2px -1.2px 0 #000, 1.2px -1.2px 0 #000, -1.2px 1.2px 0 #000, 1.2px 1.2px 0 #000'
            : '-1.2px -1.2px 0 #fff, 1.2px -1.2px 0 #fff, -1.2px 1.2px 0 #fff, 1.2px 1.2px 0 #fff'

          return (
            <Marker key={key} longitude={lng} latitude={lat} anchor="bottom">
              <div className="group flex flex-col items-center cursor-default">
                {/* Outlined Label without Background */}
                <div 
                  style={{
                    color: labelColor,
                    textShadow: textShadowStyle
                  }}
                  className="mb-1 text-[9.5px] font-extrabold tracking-wide whitespace-nowrap opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none"
                >
                  {name || 'POI'}
                </div>

                {/* Marker Pin */}
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
              </div>
            </Marker>
          )
        })}
      </Map>
    </div>
  )
}
