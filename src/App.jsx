import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import OnboardingPortal from './pages/OnboardingPortal';
import VerifyIdentity from './pages/VerifyIdentity';
import PostSubmissionDashboard from './pages/PostSubmissionDashboard';
import SystemAdminHidden from './pages/SystemAdminHidden';
import ApplicationManager from './pages/ApplicationManager';
import ApplicationDealRoom from './pages/ApplicationDealRoom';
import AdminMerchantPortfolio from './pages/AdminMerchantPortfolio';
import AdminMerchantAccountHome from './pages/AdminMerchantAccountHome';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MerchantLocationsHome from './pages/MerchantLocationsHome';
import MerchantLocationDetail from './pages/MerchantLocationDetail';
import MerchantAccountPage from './pages/MerchantAccountPage';
import DevTrackerPreview from './pages/DevTrackerPreview';
import DevSignerPreview from './pages/DevSignerPreview';
import DevPortalPreview from './pages/DevPortalPreview';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';
import { setSentryPortalContext } from '@/lib/sentry';

function SentryRouteTags() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const corporateId = params.get('corporateId') || params.get('dealId') || undefined;
    const impersonating =
      (typeof sessionStorage !== 'undefined' &&
        corporateId &&
        sessionStorage.getItem('portal_impersonating') === String(corporateId)) ||
      false;
    setSentryPortalContext({
      corporateId,
      impersonating,
      route: location.pathname + location.search,
    });
  }, [location.pathname, location.search]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <SentryRouteTags />
          <FeedbackWidget />
          <Routes>
            <Route path="/" element={<OnboardingPortal />} />
            <Route path="/verify" element={<VerifyIdentity />} />
            <Route path="/onboarding/dashboard" element={<PostSubmissionDashboard />} />
            <Route path="/center" element={<PostSubmissionDashboard />} />
            <Route path="/center/deals/:corporateId" element={<PostSubmissionDashboard />} />
            <Route path="/locations" element={<MerchantLocationsHome />} />
            <Route path="/locations/:id" element={<MerchantLocationDetail />} />
            <Route path="/account" element={<MerchantAccountPage />} />
            <Route path="/admin/architecture" element={<SystemAdminHidden />} />
            <Route path="/admin/applications" element={<ApplicationManager />} />
            <Route path="/admin/applications/:corporateId" element={<ApplicationDealRoom />} />
            <Route path="/admin/center" element={<AdminMerchantPortfolio />} />
            <Route path="/admin/center/accounts/:merchantAccountId" element={<AdminMerchantAccountHome />} />
            {/* Auth pages — required when base44.auth.redirectToLogin() lands on /login
                (e.g. agent opens /?corporateId= without a workspace session). Without
                these routes the SPA catch-all rendered a blank/404 "login" page. */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {import.meta.env.DEV && (
              <>
                <Route path="/dev/tracker-preview" element={<DevTrackerPreview />} />
                <Route path="/dev/signer-preview" element={<DevSignerPreview />} />
                <Route path="/dev/portal-preview" element={<DevPortalPreview />} />
              </>
            )}
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;