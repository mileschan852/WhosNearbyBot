import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; 

// I am forcing all hidden browser errors to bleed out onto your screen.
window.addEventListener('error', (event) => {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'color: #ef4444; padding: 20px; font-family: monospace; background: #020617; z-index: 9999; position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: auto;';
  errorDiv.innerHTML = `<h2 style="font-weight: bold; margin-bottom: 10px;">CRITICAL CRASH:</h2><p>${event.message}</p><p style="margin-top: 10px; font-size: 12px; color: #94a3b8;">${event.filename} (Line ${event.lineno})</p>`;
  document.body.appendChild(errorDiv);
});

// I am also catching database connection rejections.
window.addEventListener('unhandledrejection', (event) => {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'color: #ef4444; padding: 20px; font-family: monospace; background: #020617; z-index: 9999; position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: auto;';
  errorDiv.innerHTML = `<h2 style="font-weight: bold; margin-bottom: 10px;">DATABASE/PROMISE CRASH:</h2><p>${event.reason}</p>`;
  document.body.appendChild(errorDiv);
});

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
