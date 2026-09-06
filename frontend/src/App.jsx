import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TopBar from './components/TopBar';
import BeekeeperDashboard from './pages/BeekeeperDashboard';
import HiveDetail from './pages/HiveDetail';
import AdminBatchPipeline from './pages/AdminBatchPipeline';
import ConsumerScan from './pages/ConsumerScan';
import ClusterAlerts from './pages/ClusterAlerts';
import LedgerExplorer from './pages/LedgerExplorer';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <TopBar />
        <Routes>
          <Route path="/" element={<Navigate to="/beekeeper" replace />} />
          <Route path="/beekeeper" element={<BeekeeperDashboard />} />
          <Route path="/beekeeper/hives/:hiveId" element={<HiveDetail />} />
          <Route path="/cluster" element={<ClusterAlerts />} />
          <Route path="/admin" element={<AdminBatchPipeline />} />
          <Route path="/ledger" element={<LedgerExplorer />} />
          <Route path="/scan" element={<ConsumerScan />} />
          <Route path="/scan/:qrToken" element={<ConsumerScan />} />
          <Route path="/verify/:qrToken" element={<ConsumerScan />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
