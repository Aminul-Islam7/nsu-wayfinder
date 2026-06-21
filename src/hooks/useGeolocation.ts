import { useEffect, useRef, useCallback } from 'react'

interface GeoTrackingOptions {
  enabled: boolean
  onPosition: (lng: number, lat: number, accuracy: number) => void
}

export function useGeolocation({ enabled, onPosition }: GeoTrackingOptions): void {
  const watchIdRef  = useRef<number | null>(null)
  const onPositionRef = useRef(onPosition)
  useEffect(() => { onPositionRef.current = onPosition }, [onPosition])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        onPositionRef.current(pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy)
      },
      () => { /* silently ignore — dead reckoning takes over */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    )
  }, [])

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) start()
    else stop()
    return stop
  }, [enabled, start, stop])
}
