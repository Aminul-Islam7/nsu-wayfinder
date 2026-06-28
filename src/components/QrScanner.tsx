import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X, QrCode, Loader2, AlertCircle } from 'lucide-react'

interface QrScanResult {
  startParam?: string
  destParam?: string
  levelParam?: string
  latParam?: string
  lngParam?: string
  rawUrl: string
}

interface QrScannerProps {
  isDark: boolean
  onResult: (result: QrScanResult) => void
  onClose: () => void
}

function parseQrUrl(rawText: string): QrScanResult | null {
  // Try parsing as a URL (ignore the domain, just grab params)
  try {
    let url: URL
    if (rawText.startsWith('http://') || rawText.startsWith('https://')) {
      url = new URL(rawText)
    } else {
      // Treat as path+query
      url = new URL('https://placeholder.invalid' + (rawText.startsWith('/') ? rawText : '/' + rawText))
    }
    const p = url.searchParams
    const result: QrScanResult = { rawUrl: rawText }

    const startParam = p.get('start')
    const destParam  = p.get('dest')
    const levelParam = p.get('level')
    const latParam   = p.get('lat')
    const lngParam   = p.get('lng') || p.get('lon') || p.get('longitude')

    if (startParam) result.startParam = startParam
    if (destParam)  result.destParam  = destParam
    if (levelParam) result.levelParam = levelParam
    if (latParam)   result.latParam   = latParam
    if (lngParam)   result.lngParam   = lngParam

    // At least one recognizable param must be present
    if (startParam || destParam || levelParam || (latParam && lngParam)) {
      return result
    }
    return null
  } catch {
    return null
  }
}

export function QrScanner({ isDark, onResult, onClose }: QrScannerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const [status, setStatus]   = useState<'requesting' | 'scanning' | 'error'>('requesting')
  const [errorMsg, setErrorMsg] = useState('')
  const [detected, setDetected] = useState(false)

  useEffect(() => {
    let active = true

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', 'true')
          await videoRef.current.play()
          setStatus('scanning')
          scan()
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err?.message?.includes('Permission')
            ? 'Camera permission denied. Please allow camera access and try again.'
            : 'Could not access camera. Please check your device settings.')
          setStatus('error')
        }
      }
    }

    const scan = () => {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !active) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code && code.data) {
          const parsed = parseQrUrl(code.data)
          if (parsed) {
            setDetected(true)
            setTimeout(() => {
              stopCamera()
              onResult(parsed)
            }, 350) // brief flash to confirm scan
            return
          }
        }
      }
      animRef.current = requestAnimationFrame(scan)
    }

    const stopCamera = () => {
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    startCamera()
    return () => {
      active = false
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const handleClose = () => {
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    onClose()
  }

  const overlayBg = isDark ? 'rgba(0,0,0,0.96)' : 'rgba(10,10,20,0.97)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: overlayBg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'qr-fade-in 0.22s ease forwards',
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'rgba(37,99,235,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <QrCode size={20} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Scan QR Code</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
              Point camera at a location QR code
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(255,255,255,0.10)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Camera area */}
      <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Video feed */}
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: status === 'scanning' ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Scan viewfinder overlay */}
        {status === 'scanning' && (
          <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
            {/* Corner brackets */}
            <div style={{
              width: 240, height: 240,
              position: 'relative',
            }}>
              {/* Top-left */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 36, height: 36, borderTop: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderLeft: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRadius: '2px 0 0 0', transition: 'border-color 0.2s' }} />
              {/* Top-right */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, borderTop: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRight: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRadius: '0 2px 0 0', transition: 'border-color 0.2s' }} />
              {/* Bottom-left */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: 36, height: 36, borderBottom: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderLeft: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRadius: '0 0 0 2px', transition: 'border-color 0.2s' }} />
              {/* Bottom-right */}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderBottom: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRight: `3px solid ${detected ? '#10b981' : '#3b82f6'}`, borderRadius: '0 0 2px 0', transition: 'border-color 0.2s' }} />
              {/* Scan line animation */}
              {!detected && (
                <div style={{
                  position: 'absolute', left: 4, right: 4, top: 0,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
                  animation: 'qr-scan-line 2s linear infinite',
                }} />
              )}
              {detected && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(16,185,129,0.15)',
                  borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 36 }}>✓</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Requesting permission spinner */}
        {status === 'requesting' && (
          <div style={{ textAlign: 'center', zIndex: 10 }}>
            <Loader2 size={48} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', marginBottom: 16 }} />
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>Opening camera…</div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div style={{ textAlign: 'center', zIndex: 10, padding: '0 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertCircle size={32} color="#f43f5e" />
            </div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Camera Error</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.5 }}>{errorMsg}</div>
            <button
              onClick={handleClose}
              style={{
                marginTop: 24, padding: '12px 28px', borderRadius: 12,
                background: '#2563eb', color: '#fff', border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* Dark mask sides (letterbox the viewfinder) */}
        {status === 'scanning' && (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', WebkitMaskImage: 'radial-gradient(ellipse 240px 240px at center, transparent 100%, black 100%)' }} />
          </>
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '24px 32px 40px',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        {status === 'scanning' && !detected && 'Hold your camera steady over the QR code on the sign'}
        {detected && <span style={{ color: '#10b981', fontWeight: 600 }}>QR code detected! Setting your location…</span>}
      </div>

      <style>{`
        @keyframes qr-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes qr-scan-line {
          0%   { top: 4px; }
          50%  { top: calc(100% - 6px); }
          100% { top: 4px; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
