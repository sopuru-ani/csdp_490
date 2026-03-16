import { Route, Routes } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import Dashboard from "@/pages/Dashboard";
import ReportLost from "@/pages/ReportLost";
import ReportFound from "@/pages/ReportFound";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/reportlost" element={<ReportLost />} />
      <Route path="/reportfound" element={<ReportFound />} />
    </Routes>
  );
}

export default AppRoutes;
