import { useState, useEffect, useRef, useCallback } from 'react';

export interface OrientationState {
	heading: number | null; // 0-360, clockwise from north
	hasCompass: boolean; // device supports compass
	permissionGranted: boolean;
	requestPermission: () => Promise<void>;
}

const ALPHA = 0.15; // EMA smoothing factor (lower = smoother, more lag)

function smoothAngle(prev: number | null, next: number): number {
	if (prev === null) return next;
	// Handle wrap-around (359 → 1 should not jump)
	let diff = next - prev;
	if (diff > 180) diff -= 360;
	if (diff < -180) diff += 360;
	return (prev + ALPHA * diff + 360) % 360;
}

export function useDeviceOrientation(): OrientationState {
	const [heading, setHeading] = useState<number | null>(null);
	const [hasCompass, setHasCompass] = useState(false);
	const [permissionGranted, setPermissionGranted] = useState(false);
	const smoothRef = useRef<number | null>(null);

	const handleOrientation = useCallback((e: any) => {
		// `webkitCompassHeading` is iOS absolute heading (0=north, clockwise)
		// `alpha` is arbitrary on Android — need `absolute: true` events or webkitCompassHeading
		const raw = (e as any).webkitCompassHeading ?? (e.absolute && e.alpha !== null ? (360 - e.alpha) % 360 : null);

		if (raw === null) return;
		setHasCompass(true);
		smoothRef.current = smoothAngle(smoothRef.current, raw);
		setHeading(smoothRef.current);
	}, []);

	const startListening = useCallback(() => {
		window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
		window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
	}, [handleOrientation]);

	const requestPermission = useCallback(async () => {
		try {
			// Guard: DeviceOrientationEvent may not be defined in all browsers
			if (typeof (window as any).DeviceOrientationEvent === 'undefined') {
				setPermissionGranted(false);
				return;
			}

			const DOE = (window as any).DeviceOrientationEvent;
			if (typeof DOE.requestPermission === 'function') {
				const result = await DOE.requestPermission();
				if (result === 'granted') {
					setPermissionGranted(true);
					startListening();
				}
			} else {
				// Non-iOS: no permission needed
				setPermissionGranted(true);
				startListening();
			}
		} catch {
			// ignore
		}
	}, [startListening]);

	useEffect(() => {
		const DOE = (window as any).DeviceOrientationEvent;
		if (!DOE || typeof DOE.requestPermission !== 'function') {
			// Android / desktop — auto-start, no permission needed
			setPermissionGranted(true);
			startListening();
		}
		// iOS: wait for requestPermission() call via button tap

		return () => {
			window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
			window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
		};
	}, [startListening, handleOrientation]);

	return { heading, hasCompass, permissionGranted, requestPermission };
}
