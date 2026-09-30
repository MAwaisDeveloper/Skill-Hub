import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from './context';

// Route-level role guard: galat role ke user ko error ke bajaye uske apne panel par redirect karo.
// (Yahan tak pohanchne se pehle sidebar mein hi is role ke links nahi hote — ye sirf direct URL taip karne walon ke liye hai.)
function RoleRoute({ role, children }) {
  const { session } = useApp();
  const loc = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (session.user?.role !== role) {
    const home = { admin: '/admin', professional: '/professional', customer: '/customer' }[session.user?.role] || '/';
    return <Navigate to={home} replace />;
  }
  return children;
}
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CustomerOverview from './pages/CustomerOverview';
import CustomerBookings from './pages/CustomerBookings';
import CustomerWallet from './pages/CustomerWallet';
import CustomerWithdraw from './pages/CustomerWithdraw';
import CustomerTopups from './pages/CustomerTopups';
import CustomerRefunds from './pages/CustomerRefunds';
import CustomerReviews from './pages/CustomerReviews';
import WalletStatement from './pages/WalletStatement';
import CustomerContracts from './pages/CustomerContracts';
import CustomerProfile from './pages/CustomerProfile';
import BookingFlow from './pages/BookingFlow';
import BookingDetail from './pages/BookingDetail';
import TopupGateway from './pages/TopupGateway';
import ProfessionalOverview from './pages/ProfessionalOverview';
import ProJobs from './pages/ProJobs';
import ProWallet from './pages/ProWallet';
import ProPayouts from './pages/ProPayouts';
import ProReviews from './pages/ProReviews';
import ProSlots from './pages/ProSlots';
import ProProfile from './pages/ProProfile';
import ProBookingDetail from './pages/ProBookingDetail';
import ProContracts from './pages/ProContracts';
import AdminDashboard from './pages/AdminDashboard';
import Guide from './pages/Guide';
import NotificationsPage from './pages/NotificationsPage';
import InvoicePage from './pages/InvoicePage';
import SettingsPage from './pages/SettingsPage';
import PrivacyPage from './pages/PrivacyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/guide" element={<Guide />} />

      {/* Customer */}
      <Route path="/customer" element={<RoleRoute role="customer"><CustomerOverview /></RoleRoute>} />
      <Route path="/customer/bookings" element={<RoleRoute role="customer"><CustomerBookings /></RoleRoute>} />
      <Route path="/customer/wallet" element={<RoleRoute role="customer"><CustomerWallet /></RoleRoute>} />
      <Route path="/customer/wallet/statement" element={<RoleRoute role="customer"><WalletStatement /></RoleRoute>} />
      <Route path="/customer/wallet/topups" element={<RoleRoute role="customer"><CustomerTopups /></RoleRoute>} />
      <Route path="/customer/wallet/refunds" element={<RoleRoute role="customer"><CustomerRefunds /></RoleRoute>} />
      <Route path="/customer/withdraw" element={<RoleRoute role="customer"><CustomerWithdraw /></RoleRoute>} />
      <Route path="/customer/reviews" element={<RoleRoute role="customer"><CustomerReviews /></RoleRoute>} />
      <Route path="/customer/contracts" element={<RoleRoute role="customer"><CustomerContracts /></RoleRoute>} />
      <Route path="/customer/profile" element={<RoleRoute role="customer"><CustomerProfile /></RoleRoute>} />
      <Route path="/customer/notifications" element={<RoleRoute role="customer"><NotificationsPage /></RoleRoute>} />
      <Route path="/book" element={<RoleRoute role="customer"><BookingFlow /></RoleRoute>} />
      <Route path="/bookings/:id" element={<RoleRoute role="customer"><BookingDetail /></RoleRoute>} />
      <Route path="/wallet/topup/:reference/pay" element={<TopupGateway />} />

      {/* Professional (Service Provider) */}
      <Route path="/professional" element={<RoleRoute role="professional"><ProfessionalOverview /></RoleRoute>} />
      <Route path="/professional/jobs" element={<RoleRoute role="professional"><ProJobs /></RoleRoute>} />
      <Route path="/professional/wallet" element={<RoleRoute role="professional"><ProWallet /></RoleRoute>} />
      <Route path="/professional/wallet/statement" element={<RoleRoute role="professional"><WalletStatement /></RoleRoute>} />
      <Route path="/professional/wallet/payouts" element={<RoleRoute role="professional"><ProPayouts /></RoleRoute>} />
      <Route path="/professional/reviews" element={<RoleRoute role="professional"><ProReviews /></RoleRoute>} />
      <Route path="/professional/slots" element={<RoleRoute role="professional"><ProSlots /></RoleRoute>} />
      <Route path="/professional/profile" element={<RoleRoute role="professional"><ProProfile /></RoleRoute>} />
      <Route path="/professional/bookings/:id" element={<RoleRoute role="professional"><ProBookingDetail /></RoleRoute>} />
      <Route path="/professional/contracts" element={<RoleRoute role="professional"><ProContracts /></RoleRoute>} />
      <Route path="/professional/notifications" element={<RoleRoute role="professional"><NotificationsPage /></RoleRoute>} />

      {/* Admin */}
      <Route path="/admin" element={<RoleRoute role="admin"><AdminDashboard /></RoleRoute>} />
      <Route path="/admin/settings-profile" element={<SettingsPage />} />
      <Route path="/invoice/:type/:id" element={<InvoicePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </Routes>
  );
}
