import React from "react";
import Sidebar from "./Sidebar";
import MobileTopNav from "./MobileTopNav";
import { useAuth } from "../context/AuthContext";

const BlankDashboard = () => {
  const { role } = useAuth();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex' }}>
      {!isMobile && <Sidebar role={role} />}
      {isMobile && <MobileTopNav role={role} />}
      {/* Blank main area */}
      <div style={{ flex: 1, marginLeft: isMobile ? 0 : 68, paddingTop: isMobile ? 56 : 0 }} />
    </div>
  );
};

export default BlankDashboard;
