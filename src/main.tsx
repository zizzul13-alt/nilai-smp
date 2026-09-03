import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/base.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Nilai SMP bootstrap failed: #root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
