import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { ProjectionView } from './ui/ProjectionView';

const isProjection = new URLSearchParams(window.location.search).get('view') === 'projection';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isProjection ? <ProjectionView /> : <App />}</StrictMode>,
);
