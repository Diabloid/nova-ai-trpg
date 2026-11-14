import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

async function bootstrap() {
  if (import.meta.env.MODE === 'web') {
    const { ensureElectronWebFallback } = await import('./utils/electronFallback.ts');
    ensureElectronWebFallback();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
