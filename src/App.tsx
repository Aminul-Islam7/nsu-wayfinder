import { MapCanvas } from './components/map/MapCanvas'
import { useStore } from './store/useStore'
import { Compass, Database, GraduationCap, MapPin, ArrowUpDown } from 'lucide-react'

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


function App() {
  const { activeLevel, features, isLoading, error } = useStore()

  // Calculate statistics for the active floor
  const levelFeatures = features.filter((f) => f.properties?.level === activeLevel)
  const poiCount = levelFeatures.filter((f) => f.properties?.type === 'poi').length
  const pathCount = levelFeatures.filter((f) => f.properties?.type === 'path').length
  const transitCount = levelFeatures.filter((f) => f.properties?.type === 'transit').length

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none">
      {/* Primary Map Canvas (background layer) */}
      <div className="absolute inset-0 w-full h-full z-0">
        <MapCanvas />
      </div>

      {/* Floating Control Dashboard (glassmorphism overlay) */}
      <aside className="absolute top-4 left-4 z-40 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto bg-background/80 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-5 flex flex-col gap-6 animate-in slide-in-from-left duration-500">
        {/* Header block */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Compass className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              NSU Wayfinder
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Indoor navigation for NAC / SAC / Library complex
          </p>
        </div>

        {/* Database Sync Status */}
        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border/40 text-xs">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-muted-foreground">Supabase Live Connection</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            {isLoading ? (
              <>
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                <span className="text-warning">Syncing...</span>
              </>
            ) : error ? (
              <>
                <span className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-destructive">Offline</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-success text-[10px] uppercase font-bold tracking-wider">Connected</span>
              </>
            )}
          </div>
        </div>

        {/* Floor Statistics Panel */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Floor Statistics — Level {activeLevel}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center justify-center p-2.5 bg-card/60 rounded-xl border border-border/50 shadow-sm">
              <span className="text-lg font-bold text-foreground">{poiCount}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">POIs</span>
            </div>
            <div className="flex flex-col items-center justify-center p-2.5 bg-card/60 rounded-xl border border-border/50 shadow-sm">
              <span className="text-lg font-bold text-foreground">{pathCount}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">Paths</span>
            </div>
            <div className="flex flex-col items-center justify-center p-2.5 bg-card/60 rounded-xl border border-border/50 shadow-sm">
              <span className="text-lg font-bold text-foreground">{transitCount}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">Transit</span>
            </div>
          </div>
        </div>

        {/* Map Legend */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Map Legend
          </h2>
          <div className="flex flex-col gap-2.5 text-xs text-foreground font-medium">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-primary/10 border border-primary/40 rounded shadow-sm" />
              <span>Building Footprint</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-0.5 bg-indigo-500 rounded" />
              <span>Corridor path network</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center text-white scale-90">
                <MapPin className="w-2.5 h-2.5" />
              </div>
              <span>General POI (Restroom, lounge, etc.)</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white scale-90">
                <GraduationCap className="w-2.5 h-2.5" />
              </div>
              <span>Classrooms / Academic Rooms</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white scale-90">
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
              <span>Elevator / Lifts</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white scale-90">
                <StairsIcon className="w-2.5 h-2.5" />
              </div>
              <span>Staircases</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <footer className="mt-auto pt-4 border-t border-border/40 text-[10px] text-muted-foreground text-center font-medium">
          North South University Indoors &copy; {new Date().getFullYear()}
        </footer>
      </aside>
    </div>
  )
}

export default App
