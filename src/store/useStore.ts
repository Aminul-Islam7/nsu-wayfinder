import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type Level = 1 | 2

export interface RouteState {
  origin: [number, number] | null   // [lng, lat] snapped start
  rawOrigin: [number, number] | null // [lng, lat] raw parsed from URL
  destination: string | null        // feature_id of destination POI
  routeCoordinates: [number, number][] // [lng, lat][] coordinate path
  steps: string[]                   // turn-by-turn instructions
  transitLevel: Level | null        // level being switched to mid-route
}

interface AppStore {
  // Map state
  activeLevel: Level
  setActiveLevel: (level: Level) => void
  features: any[]
  setFeatures: (features: any[]) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  error: string | null
  setError: (err: string | null) => void
  fetchFeatures: () => Promise<void>

  // Selection
  selectedFeatureId: string | null
  setSelectedFeatureId: (id: string | null) => void

  // Routing
  route: RouteState
  setOrigin: (coords: [number, number] | null) => void
  setRawOrigin: (coords: [number, number] | null) => void
  setDestination: (featureId: string | null) => void
  setRouteCoordinates: (coords: [number, number][]) => void
  setRouteSteps: (steps: string[]) => void
  clearRoute: () => void

  // Admin mode
  isAdminMode: boolean
  setAdminMode: (enabled: boolean) => void
}

const defaultRoute: RouteState = {
  origin: null,
  rawOrigin: null,
  destination: null,
  routeCoordinates: [],
  steps: [],
  transitLevel: null,
}

export const useStore = create<AppStore>((set) => ({
  // Map state
  activeLevel: 1,
  setActiveLevel: (level) => set({ activeLevel: level }),
  features: [],
  setFeatures: (features) => set({ features }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),
  fetchFeatures: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('get_feature_collection')
      if (error) throw error
      if (data && data.features) {
        set({ features: data.features, isLoading: false })
      } else {
        set({ features: [], isLoading: false })
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch features', isLoading: false })
    }
  },

  // Selection
  selectedFeatureId: null,
  setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),

  // Routing
  route: defaultRoute,
  setOrigin:      (coords) => set((s) => ({ route: { ...s.route, origin: coords } })),
  setRawOrigin:   (coords) => set((s) => ({ route: { ...s.route, rawOrigin: coords } })),
  setDestination: (id)     => set((s) => ({ route: { ...s.route, destination: id } })),
  setRouteCoordinates: (coords) => set((s) => ({ route: { ...s.route, routeCoordinates: coords } })),
  setRouteSteps:  (steps)  => set((s) => ({ route: { ...s.route, steps } })),
  clearRoute:              () => set({ route: defaultRoute }),

  // Admin mode
  isAdminMode: false,
  setAdminMode: (enabled) => set({ isAdminMode: enabled }),
}))

