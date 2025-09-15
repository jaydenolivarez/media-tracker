import React, { useState, useRef } from "react";
import { FiSettings } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import PropertyCSVUploadModal from "./PropertyCSVUploadModal";
import NotificationsModal from "./NotificationsModal";
import FloatingBanner from "./FloatingBanner";
import ActionLogModal from "./ActionLogModal";

const SettingsPage = ({ onLinkDropbox }) => {
  const { userData } = useAuth();
  const [csvModalOpen, setCSVModalOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const notifTimeout = useRef(null);



  const handleCSVUpload = file => {
    // TODO: handle CSV file upload (store in state, send to backend, etc.)
    // For now, just log
    console.log("CSV file uploaded:", file);
  };

  // Success banner auto-hide
  React.useEffect(() => {
    if (notifSuccess) {
      notifTimeout.current = setTimeout(() => setNotifSuccess(false), 3000);
      return () => clearTimeout(notifTimeout.current);
    }
  }, [notifSuccess]);

  return (
    <div style={settingsContainerStyle}>
      <FloatingBanner
        message="Notification emails saved successfully."
        visible={notifSuccess}
        type="success"
        onClose={() => setNotifSuccess(false)}
      />
      <div style={{
        width: "60%",
        background: "var(--bg-card)",
        padding: "2rem",
        borderRadius: 16,
        boxShadow: "0 6px 36px rgba(60,80,130,0.18)",
        margin: "2rem auto",
        alignItems: "center",
        display: "flex",
        flexDirection: "column"
      }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}> <FiSettings size={24} color="var(--button-text)" /> Settings</h2>

      {/* <button style={dropboxButtonStyle} onClick={onLinkDropbox}>
        Link Dropbox Account
      </button> */}
      {userData?.roles?.includes("manager") && (
        <button
          style={dropboxButtonStyle}
          onClick={() => setNotifModalOpen(true)}
        >
          Manage Notifications
        </button>
      )}
      {userData?.permissions?.propertyManagement === true && (
        <button
          style={dropboxButtonStyle}
          onClick={() => setCSVModalOpen(true)}
        >
          Update Properties
        </button>
      )}
      {userData?.permissions?.adminTrackingLog === true && (
        <button
          style={{...dropboxButtonStyle, background: '#961717', marginTop: 52}}
          onClick={() => setActionLogOpen(true)}
        >
          Action Log
        </button>
      )}
      <NotificationsModal
        open={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        onSuccess={() => setNotifSuccess(true)}
      />
      <PropertyCSVUploadModal
        open={csvModalOpen}
        onClose={() => setCSVModalOpen(false)}
        onUpload={handleCSVUpload}
      />
      <ActionLogModal
        open={actionLogOpen}
        onClose={() => setActionLogOpen(false)}
      />
    </div>
    </div>
  );
};

const settingsContainerStyle = {
  padding: "2rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  background: "var(--main-bg)",
  borderRadius: 8,
  minWidth: 300,
  margin: "2rem auto",
};

const dropboxButtonStyle = {
  marginTop: 24,
  padding: "0.75rem 1.5rem",
  background: "#0061FF",
  color: "white",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
};

export default SettingsPage;
