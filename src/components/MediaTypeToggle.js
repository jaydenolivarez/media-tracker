import React, { useEffect, useState } from "react";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { MEDIA_TYPES, getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";

/**
 * MediaTypeToggle
 * Props:
 * - enabledMediaTypes: array of media type keys user has permission for
 * - selectedMediaTypes: array of currently enabled types for viewing
 * - onChange: function(newSelectedArray)
 * - persistKey: string key for Firestore field (e.g. 'mediaTypeToggle')
 */
export default function MediaTypeToggle({ enabledMediaTypes, selectedMediaTypes, onChange, persistKey = "mediaTypeToggle" }) {
  const { user, userData, refreshUserData } = useAuth();
  const [saving, setSaving] = useState(false);

  // Save toggle state to Firestore
  const persistSelection = async (newSelection) => {
    if (!user || !userData?.id) return;
    setSaving(true);
    try {
      const db = getFirestore();
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { [persistKey]: newSelection }, { merge: true });
      if (refreshUserData) refreshUserData();
    } catch (err) {
      // Optionally show error
    }
    setSaving(false);
  };

  const handleToggle = (key) => {
    let newSelection = [];
    const enabledSet = new Set(selectedMediaTypes);
    const isEnabled = enabledSet.has(key);
    const enabledCount = selectedMediaTypes.length;
    const allTypes = enabledMediaTypes;

    if (isEnabled) {
      if (enabledCount === 1) {
        // Only one enabled, clicking disables it and enables all others
        newSelection = allTypes.filter(k => k !== key);
      } else if (enabledCount === 2) {
        // Two enabled, clicking disables the other and keeps this one
        newSelection = [key];
      } else {
        // More than two enabled, just disable this one
        newSelection = selectedMediaTypes.filter(k => k !== key);
      }
    } else {
      // If disabled, clicking enables it (additive)
      newSelection = [...selectedMediaTypes, key];
    }
    // Prevent zero enabled: if newSelection is empty, enable all
    if (newSelection.length === 0) {
      newSelection = [...allTypes];
    }
    onChange(newSelection);
    persistSelection(newSelection);
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0 12px 0" }}>
      {MEDIA_TYPES.filter((t) => enabledMediaTypes.includes(t.key)).map((type) => (
        <button
          key={type.key}
          onClick={() => handleToggle(type.key)}
          disabled={saving}
          style={{
            background: selectedMediaTypes.includes(type.key) ? type.color : "#e5e7eb",
            color: selectedMediaTypes.includes(type.key) ? "#fff" : "#222",
            border: "none",
            borderRadius: 18,
            padding: "7px 18px",
            fontWeight: 600,
            fontSize: 15,
            cursor: saving ? "pointer" : "pointer",
            opacity: saving ? 0.7 : 1,
            boxShadow: selectedMediaTypes.includes(type.key)
              ? "0 2px 8px rgba(0,0,0,0.10)"
              : "none",
            transition: "background 0.18s, color 0.18s, box-shadow 0.18s"
          }}
          aria-pressed={selectedMediaTypes.includes(type.key)}
        >
          {getMediaTypeLabel(type.key)}
        </button>
      ))}
    </div>
  );
}
