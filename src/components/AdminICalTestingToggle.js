import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { setAdminTestingMode } from "../utils/icalAvailability";
import { useAuth } from "../context/AuthContext";

const containerStyle = {
  background: "#fffbe7",
  border: "1.5px solid #f7d674",
  borderRadius: 8,
  padding: "18px 18px 10px 18px",
  marginBottom: 24,
  marginTop: 8,
  color: "#665200",
  fontSize: 16,
  boxShadow: "0 1px 6px rgba(80,120,200,0.07)",
  maxWidth: 480,
  float: "right"
};
const toggleStyle = {
  margin: "12px 0 0 0",
  padding: "8px 18px",
  background: "#f7d674",
  color: "#665200",
  border: "none",
  borderRadius: 5,
  fontWeight: 600,
  fontSize: 16,
  cursor: "pointer"
};

export default function AdminICalTestingToggle() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function fetchState() {
      setLoading(true);
      setError("");
      try {
        if (!user?.uid) throw new Error("No user");
        const db = getFirestore();
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const adminTesting = userDoc.data()?.permissions?.adminTesting;
        if (mounted) {
          setEnabled(adminTesting);
          setAdminTestingMode(adminTesting);
        }
      } catch (e) {
        setError("Failed to load admin testing state.");
      }
      setLoading(false);
    }
    fetchState();
    return () => { mounted = false; };
  }, [user]);

  async function handleToggle() {
    setLoading(true);
    setError("");
    try {
      if (!user?.uid) throw new Error("No user");
      const db = getFirestore();
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const permissions = userDoc.data()?.permissions || {};
      const newVal = !enabled;
      await updateDoc(userRef, { permissions: { ...permissions, adminTesting: newVal } });
      setEnabled(newVal);
      setAdminTestingMode(newVal);
    } catch (e) {
      setError("Failed to update admin testing state.");
    }
    setLoading(false);
  }

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Admin iCal Debug Mode</div>
      <div style={{ marginBottom: 8 }}>
        <div><b>Status:</b> {enabled ? <span style={{ color: '#c90000' }}>ENABLED</span> : <span style={{ color: '#0b8600' }}>DISABLED</span>}</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>
          When enabled, live iCal fetches are <b>disabled</b> for this account. Only cached iCal data will be used.<br />
          Toggle again to restore live fetching.
        </div>
      </div>
      {error && <div style={{ color: '#c90000', marginBottom: 6 }}>{error}</div>}
      <button style={toggleStyle} onClick={handleToggle} disabled={loading}>
        {loading ? "Loading..." : (enabled ? "Disable iCal Debug Mode" : "Enable iCal Debug Mode")}
      </button>
    </div>
  );
}
