import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import KanbanPage from './pages/Kanban';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/" element={<Navigate to="/kanban" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
