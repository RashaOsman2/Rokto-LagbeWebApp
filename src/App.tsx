import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute, PublicRoute, ProfileSetupRoute, HospitalRoute, AdminRoute, SharedRoute } from "@/components/RouteWrappers";
import { NotificationManager } from "@/components/NotificationManager";
import { LocationPermissionDialog } from "@/components/LocationPermissionDialog";
import Login from "./pages/Login";
import ProfileSetup from "./pages/ProfileSetup";
import Terms from "./pages/Terms";
import Home from "./pages/Home";
import CreateRequest from "./pages/CreateRequest";
import Requests from "./pages/Requests";
import Profile from "./pages/Profile";
import History from "./pages/History";
import Hospitals from "./pages/Hospitals";
import HospitalLogin from "./pages/HospitalLogin";
import HospitalProfileSetup from "./pages/HospitalProfileSetup";
import HospitalDashboard from "./pages/HospitalDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/profile-setup"
        element={
          <ProfileSetupRoute>
            <ProfileSetup />
          </ProfileSetupRoute>
        }
      />
      <Route
        path="/terms"
        element={<Terms />}
      />
      <Route
        path="/"
        element={
          <SharedRoute>
            <Home />
          </SharedRoute>
        }
      />
      <Route
        path="/create-request"
        element={
          <SharedRoute>
            <CreateRequest />
          </SharedRoute>
        }
      />
      <Route
        path="/requests"
        element={
          <SharedRoute>
            <Requests />
          </SharedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hospitals"
        element={
          <ProtectedRoute>
            <Hospitals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hospital-login"
        element={<HospitalLogin />}
      />
      <Route
        path="/hospital-profile-setup"
        element={<HospitalProfileSetup />}
      />
      <Route
        path="/hospital-dashboard"
        element={
          <HospitalRoute>
            <HospitalDashboard />
          </HospitalRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <NotificationManager>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <LocationPermissionDialog />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </NotificationManager>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
