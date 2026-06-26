import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Create error overlay that's visible on phone
const errorOverlay = document.createElement('div');
errorOverlay.id = 'error-overlay';
errorOverlay.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.95);
  color: #ff6b6b;
  font-family: monospace;
  font-size: 14px;
  padding: 20px;
  overflow: auto;
  z-index: 99999;
  display: none;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
`;
document.body.appendChild(errorOverlay);

// Rolling logs (only for errors, not startup messages)
const logs: string[] = [];

// Persist recent logs so they survive a reload and show immediately
try {
	const prev = window.localStorage.getItem('nsu-wayfinder:logs');
	if (prev) {
		logs.push('--- previous session ---');
		logs.push(prev);
	}
} catch {}

const showError = (msg: string) => {
	logs.push(msg);

	// keep a rolling copy in localStorage for mobile inspection
	try {
		window.localStorage.setItem('nsu-wayfinder:logs', JSON.stringify(logs.slice(-200)));
	} catch {}
	errorOverlay.textContent = logs.join('\n');
	errorOverlay.style.display = 'block';
	console.log('[ERROR]', msg);
};

// Catch all errors
window.addEventListener('error', (e) => {
	showError(`❌ ERROR: ${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
	showError(`❌ UNHANDLED REJECTION: ${e.reason}`);
});

const root = document.getElementById('root');
if (!root) {
	showError('❌ ERROR: #root element not found');
} else {
	try {
		createRoot(root).render(
			<StrictMode>
				<App />
			</StrictMode>,
		);
		// Hide overlay if app renders successfully after 2s
		setTimeout(() => {
			if (document.body.innerHTML.includes('maplibre') && logs.length === 0) {
				errorOverlay.style.display = 'none';
			}
		}, 2000);
	} catch (err: any) {
		showError(`❌ RENDER ERROR: ${err.message}\n\n${err.stack}`);
	}
}

// Expose for manual inspection
(window as any).__logs = logs;
(window as any).__showError = showError;
