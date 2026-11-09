import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Limpieza defensiva inmediata: NUNCA permitir propiedades accessor/value como 'get' o 'value' en Object.prototype
// para evitar que Object.defineProperty en ReactElement lance TypeError en descriptores.
if (typeof Object.prototype === 'object' && Object.prototype !== null) {
  for (const key of ['get', 'setdefault', 'update']) {
    if (key in Object.prototype) {
      try {
        delete (Object.prototype as any)[key];
      } catch (_) {}
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
