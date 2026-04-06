import { Route, Routes } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import Dashboard from "@/pages/Dashboard";
import ReportLost from "@/pages/ReportLost";
import ReportFound from "@/pages/ReportFound";
import AdminMatches from "@/pages/AdminMatches";
import MyReports from "@/pages/MyReports";
import Messages from "@/pages/Messages";
import AuditLogs from "@/pages/AuditLogs";
import AdminReports from "@/pages/AdminReports";
import Dev from "@/pages/Dev";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/reportlost" element={<ReportLost />} />
      <Route path="/reportfound" element={<ReportFound />} />
      <Route path="/admin/matches" element={<AdminMatches />} />
      <Route path="/my-reports" element={<MyReports />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/admin/audit-logs" element={<AuditLogs />} />
      <Route path="/admin/reports" element={<AdminReports />} />
      <Route path="/dev" element={<Dev />} />
    </Routes>
  );
}

export default AppRoutes;
