import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import OnboardingPortal from './pages/OnboardingPortal';
import VerifyIdentity from './pages/VerifyIdentity';
import PostSubmissionDashboard from './pages/PostSubmissionDashboard';
import SystemAdminHidden from './pages/SystemAdminHidden';
import ApplicationManager from './pages/ApplicationManager';
import ApplicationHealthDashboard from './pages/ApplicationHealthDashboard';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<OnboardingPortal />} />
            <Route path="/verify" element={<VerifyIdentity />} />
            <Route path="/onboarding/dashboard" element={<PostSubmissionDashboard />} />
            <Route path="/admin/architecture" element={<SystemAdminHidden />} />
            <Route path="/admin/applications" element={<ApplicationManager />} />
            <Route path="/admin/staged" element={<ApplicationManager />} />
            <Route path="/admin/health" element={<ApplicationHealthDashboard />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;