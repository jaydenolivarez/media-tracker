import React from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Usage:
 * <RequireRole allowed={["manager", "editor"]}>
 *   <ProtectedComponent />
 * </RequireRole>
 */
const RequireRole = ({ allowed, children, fallback = null }) => {
  const { role, roleLoading, loading } = useAuth();

  if (loading || roleLoading) {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <span role="img" aria-label="hourglass">⏳</span> Checking permissions...
      </div>
    );
  }

  if (!role || (Array.isArray(allowed) && !allowed.includes(role))) {
    return fallback || null;
  }

  return <>{children}</>;
};

export default RequireRole;
