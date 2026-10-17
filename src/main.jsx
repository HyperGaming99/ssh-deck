import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './index.css';
import App from './App.jsx';
import { hideSplash } from './splash.js';

if (window.api?.mobile) document.documentElement.dataset.mobile = '1'; // Handy-Layout, siehe index.css
createRoot(document.getElementById('root')).render(<App />);
setTimeout(hideSplash, 6000); // Sicherheitsnetz, falls der Start hängt
