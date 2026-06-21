import React, { useEffect, useMemo, useState } from 'react'
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../../store/useStore'
import type { Level } from '../../store/useStore'
import { GraduationCap, MapPin, ArrowUpDown, Info } from 'lucide-react'

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

  // Filter features for the building footprint
  const footprintData = useMemo(() => {
    const filtered = features.filter(
      (f) => f.geometry && f.properties?.type === 'footprint' && f.properties?.level === activeLevel
    )
    return {
      type: 'FeatureCollection',
      features: filtered,
    }
  }, [features, activeLevel])

  // Filter features for the paths
  const pathsData = useMemo(() => {
    const filtered = features.filter(
      (f) => f.geometry && f.properties?.type === 'path' && f.properties?.level === activeLevel
    )
    return {
      type: 'FeatureCollection',
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
    paint: {
      'line-color': isDarkMode ? '#6366f1' : '#4f46e5',
      'line-width': 4,
      'line-cap': 'round',
      'line-join': 'round',
      'line-opacity': 0.7,
    },
  }

  const pathsBorderLayerStyle: any = {
    id: 'corridor-paths-border',
    type: 'line',
    paint: {
      'line-color': isDarkMode ? '#1e1b4b' : '#e0e7ff',
      'line-width': 6,
      'line-cap': 'round',
      'line-join': 'round',
      'line-opacity': 0.4,
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
          <Source type="geojson" data={footprintData}>
            <Layer {...footprintLayerStyle} />
            <Layer {...footprintLineLayerStyle} />
          </Source>
        )}

        {/* Corridor Path Mesh (LineStrings) */}
        {pathsData.features.length > 0 && (
          <Source type="geojson" data={pathsData}>
            <Layer {...pathsBorderLayerStyle} />
            <Layer {...pathsLayerStyle} />
          </Source>
        )}

        {/* POIs and Transit Nodes (Markers) */}
        {markersData.map((marker) => {
          const [lng, lat] = marker.geometry.coordinates
          const { type, category, name, transit_type, node_id } = marker.properties || {}
          const key = node_id || marker.properties?._feature_id || `${lng}-${lat}`

          const isTransit = type === 'transit'
          const isClassroom = category === 'classroom'

          return (
            <Marker key={key} longitude={lng} latitude={lat} anchor="bottom">
              <div className="group flex flex-col items-center cursor-default">
                {/* Tooltip / Label */}
                <div className="mb-1 bg-background/95 backdrop-blur-sm text-foreground text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-border/80 whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
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
