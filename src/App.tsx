import { useState, useEffect, useRef } from 'react'
import { MapCanvas } from './components/map/MapCanvas'
import { useStore } from './store/useStore'
import { Search, X } from 'lucide-react'

function App() {
  const { activeLevel, features, route, setDestination, clearRoute } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync search query with store destination on load/change
  useEffect(() => {
    if (!route.destination) {
      setSearchQuery('')
    } else {
      const destFeature = features.find((f) => f.properties?._feature_id === route.destination)
      if (destFeature) {
        setSearchQuery(destFeature.properties.name || '')
      }
    }
  }, [route.destination, features])

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const levelFeatures = features.filter((f) => f.properties?.level === activeLevel)
  const pois = levelFeatures.filter((f) => f.properties?.type === 'poi')
  const sortedPois = [...pois].sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || ''))

  const filteredPois = sortedPois.filter(poi =>
    (poi.properties?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none">
      {/* Primary Map Canvas (background layer) */}
      <div className="absolute inset-0 w-full h-full z-0">
        <MapCanvas />
      </div>

      {/* Floating Clean Search Container */}
      <aside 
        ref={dropdownRef}
        className="absolute top-4 left-4 z-40 w-80 flex flex-col gap-2 animate-in slide-in-from-left duration-500"
      >
        <div className="relative w-full bg-background/85 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-1.5 flex items-center gap-2">
          <div className="pl-3.5 text-muted-foreground/80">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            placeholder="Search room, lounge, library..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none py-2 pr-8 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => {
                clearRoute()
                setSearchQuery('')
                setIsOpen(false)
              }}
              className="absolute right-3.5 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Floating suggestion dropdown */}
        {isOpen && filteredPois.length > 0 && (
          <div className="w-full bg-background/90 backdrop-blur-md border border-border/75 rounded-2xl shadow-xl max-h-64 overflow-y-auto p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
            {filteredPois.map((poi) => (
              <button
                key={poi.properties._feature_id}
                onClick={() => {
                  setDestination(poi.properties._feature_id)
                  setSearchQuery(poi.properties.name)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent text-left text-sm font-medium text-foreground transition-all duration-150"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${
                  poi.properties.category === 'classroom' ? 'bg-indigo-500' : 'bg-rose-500'
                }`} />
                <div className="flex flex-col">
                  <span className="font-semibold">{poi.properties.name}</span>
                  <span className="text-[10px] text-muted-foreground/90 font-bold">
                    {poi.properties.building} • Level {poi.properties.level}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

export default App
