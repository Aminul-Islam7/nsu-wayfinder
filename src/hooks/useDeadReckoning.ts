import { useEffect, useRef, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────
const STEP_LENGTH_M  = 0.72          // avg stride ~72cm
const STEP_THRESHOLD = 11.5          // m/s² accel magnitude peak to count as step
const STEP_DEBOUNCE  = 280           // ms minimum between steps
const EARTH_R        = 6371000       // metres

// ── Geo helpers ────────────────────────────────────────────────────
/** Move [lng, lat] by (dNorth, dEast) metres. Returns new [lng, lat]. */
function moveByMetres(
  lng: number, lat: number,
  dNorth: number, dEast: number
): [number, number] {
  const dLat = dNorth / EARTH_R * (180 / Math.PI)
  const dLng = dEast  / (EARTH_R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI)
  return [lng + dLng, lat + dLat]
}

export interface DeadReckoningOptions {
  enabled: boolean
  heading: number | null                                      // degrees, 0=north CW
  onPositionUpdate: (lng: number, lat: number) => void
  initialPosition: [number, number] | null                   // [lng, lat]
}

export function useDeadReckoning({
  enabled,
  heading,
  onPositionUpdate,
  initialPosition,
}: DeadReckoningOptions): void {
  const posRef      = useRef<[number, number] | null>(initialPosition)
  const headingRef  = useRef<number | null>(heading)
  const lastStepRef = useRef<number>(0)
  const magBufRef   = useRef<number[]>([])   // rolling window for low-pass

  // Keep refs in sync without re-registering listeners
  useEffect(() => { headingRef.current = heading }, [heading])
  useEffect(() => { posRef.current = initialPosition }, [initialPosition])

  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    if (!enabled) return

    const acc = e.accelerationIncludingGravity
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return

    const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2)

    // Low-pass smooth (window size 3)
    magBufRef.current.push(mag)
    if (magBufRef.current.length > 3) magBufRef.current.shift()
    const smoothMag = magBufRef.current.reduce((a, b) => a + b, 0) / magBufRef.current.length

    const now = Date.now()
    if (smoothMag > STEP_THRESHOLD && now - lastStepRef.current > STEP_DEBOUNCE) {
      lastStepRef.current = now

      const pos     = posRef.current
      const hdg     = headingRef.current
      if (!pos || hdg === null) return

      // heading: 0=north, 90=east, CW
      const hdgRad = hdg * Math.PI / 180
      const dNorth = STEP_LENGTH_M * Math.cos(hdgRad)
      const dEast  = STEP_LENGTH_M * Math.sin(hdgRad)

      const [newLng, newLat] = moveByMetres(pos[0], pos[1], dNorth, dEast)
      posRef.current = [newLng, newLat]
      onPositionUpdate(newLng, newLat)
    }
  }, [enabled, onPositionUpdate])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('devicemotion', handleMotion as EventListener)
    return () => window.removeEventListener('devicemotion', handleMotion as EventListener)
  }, [enabled, handleMotion])
}
