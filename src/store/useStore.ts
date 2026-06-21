import { create } from 'zustand'

export type Level = 1 | 2

export interface RouteState {
  origin: [number, number] | null   // [lng, lat] snapped start
  destination: string | null        // feature_id of destination POI
  steps: string[]                   // turn-by-turn instructions
  transitLevel: Level | null        // level being switched to mid-route
}

interface AppStore {
  // Map state
  activeLevel: Level
  setActiveLevel: (level: Level) => void

  // Selection
  selectedFeatureId: string | null
  setSelectedFeatureId: (id: string | null) => void

  // Routing
  route: RouteState
  setOrigin: (coords: [number, number] | null) => void
  setDestination: (featureId: string | null) => void
  setRouteSteps: (steps: string[]) => void
  clearRoute: () => void

  // Admin mode
  isAdminMode: boolean
  setAdminMode: (enabled: boolean) => void
}

const defaultRoute: RouteState = {
  origin: null,
  destination: null,
  steps: [],
  transitLevel: null,
}

export const useStore = create<AppStore>((set) => ({
  // Map state
  activeLevel: 1,
  setActiveLevel: (level) => set({ activeLevel: level }),

  // Selection
  selectedFeatureId: null,
  setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),

  // Routing
  route: defaultRoute,
  setOrigin:      (coords) => set((s) => ({ route: { ...s.route, origin: coords } })),
  setDestination: (id)     => set((s) => ({ route: { ...s.route, destination: id } })),
  setRouteSteps:  (steps)  => set((s) => ({ route: { ...s.route, steps } })),
  clearRoute:              () => set({ route: defaultRoute }),

  // Admin mode
  isAdminMode: false,
  setAdminMode: (enabled) => set({ isAdminMode: enabled }),
}))
