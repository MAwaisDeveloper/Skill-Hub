import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CustomerOverview from './pages/CustomerOverview';
import CustomerBookings from './pages/CustomerBookings';
import CustomerWallet from './pages/CustomerWallet';
import CustomerContracts from './pages/CustomerContracts';
import CustomerProfile from './pages/CustomerProfile';
import BookingFlow from './pages/BookingFlow';
import BookingDetail from './pages/BookingDetail';
import TopupGateway from './pages/TopupGateway';
import ProfessionalOverview from './pages/ProfessionalOverview';
import ProJobs from './pages/ProJobs';
import ProWallet from './pages/ProWallet';
import ProSlots from './pages/ProSlots';
import ProProfile from './pages/ProProfile';
import ProBookingDetail from './pages/ProBookingDetail';
import ProContracts from './pages/ProContracts';
import AdminDashboard from './pages/AdminDashboard';
import Guide from './pages/Guide';
import ModulesPage from './pages/ModulesPage';
import NotificationsPage from './pages/NotificationsPage';
import ModuleDataPage from './pages/ModuleDataPage';
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
      <Route path="/customer" element={<CustomerOverview />} />
      <Route path="/customer/bookings" element={<CustomerBookings />} />
      <Route path="/customer/wallet" element={<CustomerWallet />} />
      <Route path="/customer/contracts" element={<CustomerContracts />} />
      <Route path="/customer/profile" element={<CustomerProfile />} />
      <Route path="/customer/modules" element={<ModulesPage />} />
      <Route path="/customer/notifications" element={<NotificationsPage />} />
      <Route path="/book" element={<BookingFlow />} />
      <Route path="/bookings/:id" element={<BookingDetail />} />
      <Route path="/wallet/topup/:reference/pay" element={<TopupGateway />} />

      {/* Professional */}
      <Route path="/professional" element={<ProfessionalOverview />} />
      <Route path="/professional/jobs" element={<ProJobs />} />
      <Route path="/professional/wallet" element={<ProWallet />} />
      <Route path="/professional/slots" element={<ProSlots />} />
      <Route path="/professional/profile" element={<ProProfile />} />
      <Route path="/professional/bookings/:id" element={<ProBookingDetail />} />
      <Route path="/professional/contracts" element={<ProContracts />} />
      <Route path="/professional/modules" element={<ModulesPage />} />
      <Route path="/professional/notifications" element={<NotificationsPage />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/modules" element={<ModulesPage />} />
      <Route path="/admin/settings-profile" element={<SettingsPage />} />
      <Route path="/modules-data/:table" element={<ModuleDataPage />} />
      <Route path="/wallet-data/:table" element={<ModuleDataPage />} />
      <Route path="/invoice/:type/:id" element={<InvoicePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </Routes>
  );
}
