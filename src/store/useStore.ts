import { create } from 'zustand';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';

export type Level = number

export interface RouteState {
	origin: [number, number] | null; // [lng, lat] snapped start
	originLevel: Level | null; // level of origin
	rawOrigin: [number, number] | null; // [lng, lat] raw parsed from URL
	destination: string | null; // feature_id of destination POI
	routeCoordinates: [number, number, number][]; // [lng, lat, level][] coordinate path
	steps: string[]; // turn-by-turn instructions
	transitLevel: Level | null; // level being switched to mid-route
}

interface AppStore {
	// Map state
	activeLevel: Level;
	setActiveLevel: (level: Level) => void;
	features: any[];
	setFeatures: (features: any[]) => void;
	isLoading: boolean;
	setIsLoading: (loading: boolean) => void;
	error: string | null;
	setError: (err: string | null) => void;
	fetchFeatures: () => Promise<void>;

	// Selection
	selectedFeatureId: string | null;
	setSelectedFeatureId: (id: string | null) => void;

	// Routing
	route: RouteState;
	setOrigin: (coords: [number, number] | null, level?: Level | null) => void;
	setRawOrigin: (coords: [number, number] | null) => void;
	setDestination: (featureId: string | null) => void;
	setRouteCoordinates: (coords: [number, number, number][]) => void;
	setRouteSteps: (steps: string[]) => void;
	clearRoute: () => void;

	// Tracking
	trackingEnabled: boolean;
	setTrackingEnabled: (v: boolean) => void;
	gpsActive: boolean;
	setGpsActive: (v: boolean) => void;

	// Admin mode
	isAdminMode: boolean;
	setAdminMode: (enabled: boolean) => void;
}

const defaultRoute: RouteState = {
	origin: null,
	originLevel: null,
	rawOrigin: null,
	destination: null,
	routeCoordinates: [],
	steps: [],
	transitLevel: null,
};

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
		set({ isLoading: true, error: null });
		try {
			if (!isSupabaseConfigured || !supabase) {
				throw new Error(supabaseConfigError);
			}
			const { data, error } = await supabase.rpc('get_feature_collection');
			if (error) throw error;
			if (data && data.features) {
				set({ features: data.features, isLoading: false });
			} else {
				set({ features: [], isLoading: false });
			}
		} catch (err: any) {
			set({ error: err.message || 'Failed to fetch features', isLoading: false });
		}
	},

	// Selection
	selectedFeatureId: null,
	setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),

	// Routing
	route: defaultRoute,
	setOrigin: (coords, level = null) => set((s) => ({ route: { ...s.route, origin: coords, originLevel: level } })),
	setRawOrigin: (coords) => set((s) => ({ route: { ...s.route, rawOrigin: coords } })),
	setDestination: (id) => set((s) => ({ route: { ...s.route, destination: id } })),
	setRouteCoordinates: (coords) => set((s) => ({ route: { ...s.route, routeCoordinates: coords } })),
	setRouteSteps: (steps) => set((s) => ({ route: { ...s.route, steps } })),
	clearRoute: () => set({ route: defaultRoute }),

	// Admin mode
	isAdminMode: false,
	setAdminMode: (enabled) => set({ isAdminMode: enabled }),

	// Tracking
	trackingEnabled: true,
	setTrackingEnabled: (v) => set({ trackingEnabled: v }),
	gpsActive: false,
	setGpsActive: (v) => set({ gpsActive: v }),
}));

if (typeof window !== 'undefined') {
	(window as any).useStore = useStore;
}
