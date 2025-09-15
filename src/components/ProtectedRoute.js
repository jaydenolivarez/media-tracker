import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Wrap protected routes. If role is 'standard', redirect to blank dashboard.
 * Usage: <ProtectedRoute><Component /></ProtectedRoute>
 */
const ProtectedRoute = ({ children }) => {
  const { role, activeRole, loading, roleLoading } = useAuth();
  const displayRole = activeRole || role;
  if (loading || roleLoading) return null;
  if (displayRole === "standard") return <Navigate to="/blank-dashboard" replace />;
  return children;
};

export default ProtectedRoute;
