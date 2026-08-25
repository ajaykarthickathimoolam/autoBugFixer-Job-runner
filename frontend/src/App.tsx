import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageGuard } from './components/PageGuard';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { AdminPage } from './pages/AdminPage';
import { UserGuidePage } from './pages/UserGuidePage';
import { JobDetailPage } from './pages/JobDetailPage';
import { BoardGalleryPage } from './pages/BoardGalleryPage';
import { BoardDetailPage } from './pages/BoardDetailPage';

export default function App() {
  return (
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<PageGuard page="DASHBOARD"><DashboardPage /></PageGuard>} />
              <Route path="/projects" element={<PageGuard page="PROJECTS"><ProjectsPage /></PageGuard>} />
              <Route path="/board" element={<PageGuard page="BOARD"><BoardGalleryPage /></PageGuard>} />
              <Route path="/board/:projectId" element={<PageGuard page="BOARD"><BoardDetailPage /></PageGuard>} />
              <Route path="/admin" element={<PageGuard page="ADMIN"><AdminPage /></PageGuard>} />
              <Route path="/guide" element={<PageGuard page="GUIDE"><UserGuidePage /></PageGuard>} />
              <Route path="/jobs/:id" element={<PageGuard page="DASHBOARD"><JobDetailPage /></PageGuard>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
  );
}
