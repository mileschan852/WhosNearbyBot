import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// This line is mandatory. If you are missing your Tailwind CSS file here, the screen will be blank.
import './index.css'; 

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
