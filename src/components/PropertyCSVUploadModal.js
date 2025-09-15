import React, { useRef, useState } from "react";
import FloatingBanner from "./FloatingBanner";
import { FiUpload } from "react-icons/fi";
import Papa from "papaparse";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import app from "../firebase";
import { useAuth } from "../context/AuthContext";
import { logAction } from "../utils/logAction";

// Parse a US-like address string into street, city, and zip.
// Examples handled:
//  - "123 Main St, Portland, OR 97205"
//  - "123 Main St, Portland 97205"
//  - "123 Main St Portland, OR 97205"
//  - "123 Main St, Portland, OR" (no zip)
// If parsing fails, returns empty parts and keeps original address string elsewhere.
function parseAddressParts(raw) {
  const result = { addressStreet: "", addressCity: "", addressZip: "" };
  if (!raw || typeof raw !== "string") return result;
  let s = raw.replace(/\s+/g, " ").trim();

  // Remove common country tokens at end
  s = s.replace(/,?\s*(?:US|USA|United States)\.?$/i, "").trim();

  // Extract ZIP (5 or 9 digits, store 5-digit root) from end
  const zipMatch = s.match(/(?:^|\D)(\d{5})(?:-\d{4})?\s*$/);
  if (zipMatch) {
    result.addressZip = zipMatch[1];
    s = s.replace(/[,\s]*(\d{5})(?:-\d{4})?\s*$/i, "").trim();
  }

  // Remove trailing state abbreviation (e.g., ", FL" or " FL")
  s = s.replace(/,?\s*[A-Z]{2}\s*$/i, "").trim();

  // Prefer splitting with " - " if present: "Street - City"
  if (s.includes(" - ")) {
    const [left, right] = s.split(" - ");
    result.addressStreet = left.trim().replace(/[,-]\s*$/, "");
    // Right side may still have a trailing comma (rare after removals)
    result.addressCity = right.trim().replace(/,\s*$/,"" );
    return result;
  }

  // Otherwise split by first comma: "Street, City"
  const firstComma = s.indexOf(",");
  if (firstComma !== -1) {
    result.addressStreet = s.slice(0, firstComma).trim();
    result.addressCity = s.slice(firstComma + 1).trim();
    return result;
  }

  // Heuristic: if the string has digits (likely street number), take last token as city
  if (/\d/.test(s)) {
    const tokens = s.split(" ");
    if (tokens.length > 2) {
      result.addressCity = tokens[tokens.length - 1].replace(/,\s*$/,"" );
      result.addressStreet = tokens.slice(0, -1).join(" ");
      return result;
    }
  }

  // Fallback: treat entire string as street
  result.addressStreet = s;
  return result;
}

export default function PropertyCSVUploadModal({ open, onClose, onUpload }) {
  const { user: currentUser, userData } = useAuth();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef();
  const securityFileInputRef = useRef();

  const [loading, setLoading] = useState(false);
  const [updateTasksChecked, setUpdateTasksChecked] = useState(true);
  const [limitToScheduling, setLimitToScheduling] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [allowExactNameMatch, setAllowExactNameMatch] = useState(false);
  const [updateSummary, setUpdateSummary] = useState("");
  // UI mode: 'property' (existing) or 'security' (new)
  const [mode, setMode] = useState('property');

  // Backfill tasks' ical fields from CSV map
  const updateTasksFromCSV = async (properties) => {
    try {
      const db = getFirestore(app);
      // Normalizer: lowercase, trim, remove punctuation/whitespace
      const norm = (s) => (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]/g, "");
      // Build lookup maps
      const byUnit = new Map();
      const byName = new Map();
      properties.forEach(p => {
        const u = norm(p.unitCode);
        const n = norm(p.name);
        const ical = p.ical || "";
        if (u) byUnit.set(u, ical);
        if (n) byName.set(n, ical);
      });

      // Fetch tasks: either limit to Scheduling or update across all stages
      const tasksRef = collection(db, "tasks");
      const snap = await getDocs(limitToScheduling ? query(tasksRef, where("stage", "==", "Scheduling")) : tasksRef);
      let toUpdate = [];
      snap.forEach(docSnap => {
        const t = { id: docSnap.id, ...docSnap.data() };
        const currentIcal = t.ical;
        const missing = currentIcal === null || currentIcal === undefined || String(currentIcal).trim() === "";
        const eligibleType = (t.propertyType || "").toString().trim();
        const isHomeCondo = eligibleType === "Home/Condo";
        const keyUnit = norm(t.unitCode || t.unit_code || t.unit || "");
        const keyName = norm(t.propertyName || t.name || "");
        let newIcal = "";
        // Strict priority: exact Unit Code match (normalized)
        if (keyUnit && byUnit.has(keyUnit)) newIcal = byUnit.get(keyUnit);
        // Optional: exact Name match (normalized) if enabled
        else if (allowExactNameMatch && keyName && byName.has(keyName)) newIcal = byName.get(keyName);
        if (newIcal && isHomeCondo) {
          if (missing) {
            toUpdate.push({ id: t.id, ical: newIcal });
          } else if (overwriteExisting && String(currentIcal).trim() !== String(newIcal).trim()) {
            toUpdate.push({ id: t.id, ical: newIcal });
          }
        }
      });

      // Batch updates (max 500 per batch)
      let updated = 0;
      for (let i = 0; i < toUpdate.length; i += 450) {
        const batch = writeBatch(db);
        const slice = toUpdate.slice(i, i + 450);
        slice.forEach(item => {
          batch.set(doc(db, "tasks", item.id), { ical: item.ical }, { merge: true });
        });
        await batch.commit();
        updated += slice.length;
      }
      setUpdateSummary(`Updated ${updated} task(s) with iCal URLs from CSV${limitToScheduling ? ' (Scheduling only)' : ' (all stages)'}${overwriteExisting ? ', overwriting existing values' : ''}.`);
    } catch (e) {
      setUpdateSummary("Failed to update tasks from CSV. Check console.");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  // Helper to process Security Codes CSV
  const processSecurityCSVFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setError("Only CSV files are allowed.");
      return;
    }
    setError("");
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = Array.isArray(results.data) ? results.data : [];
          // Normalize helper
          const norm = (s) => (s || "").toString().trim();
          const normKey = (s) => norm(s).toLowerCase();
          // Parse CSV columns: Unit Name, Code Type, Start Date, End Date, Code
          const parsed = rows
            .map(r => ({
              unitName: norm(r["Unit Name"] ?? r["Unit" ] ?? r["Name"]),
              codeType: norm(r["Code Type"] ?? r["Type"]),
              startDate: norm(r["Start Date"]),
              endDate: norm(r["End Date"]),
              code: norm(r["Code"])
            }))
            .filter(x => x.unitName && x.codeType && x.code);

          const db = getFirestore(app);
          const ref = doc(db, "autocomplete", "propertyNames");
          const snap = await getDoc(ref);
          const names = snap.exists() && Array.isArray(snap.data().names) ? snap.data().names : [];

          // Overwrite strategy: clear all existing securityCodes before applying new CSV
          for (let i = 0; i < names.length; i++) {
            const item = names[i] || {};
            if (item.securityCodes && Array.isArray(item.securityCodes) && item.securityCodes.length > 0) {
              names[i] = { ...item, securityCodes: [] };
            } else if (!item.securityCodes) {
              // ensure field exists to simplify downstream logic
              names[i] = { ...item, securityCodes: [] };
            }
          }

          // Build index by property name (exact, case-insensitive)
          const byName = new Map();
          names.forEach((item, idx) => {
            const key = normKey(item && item.name);
            if (key) byName.set(key, idx);
          });

          // Merge codes into matching property items (append all, keep multiple entries per type)
          let matched = 0, createdCodes = 0;
          for (const row of parsed) {
            const key = normKey(row.unitName);
            if (!byName.has(key)) continue;
            const idx = byName.get(key);
            const item = names[idx] || {};
            const existing = Array.isArray(item.securityCodes) ? item.securityCodes : [];
            const newEntry = {
              codeType: row.codeType,
              code: row.code,
              startDate: row.startDate || "",
              endDate: row.endDate || "",
            };
            // Always append (keep multiple entries per code type with date ranges)
            existing.push(newEntry);
            createdCodes++;
            names[idx] = { ...item, securityCodes: existing };
            matched++;
          }

          await setDoc(ref, { names, securityCodesUpdatedAt: new Date().toISOString() }, { merge: true });
          setUpdateSummary(`Security codes imported. Matched ${matched} row(s). Added ${createdCodes}. (All previous codes were cleared.)`);
          setLoading(false);
          setSuccess(true);
          onUpload && onUpload(file);
          setTimeout(() => setSuccess(false), 1600);
        } catch (err) {
          setError("Failed to read security codes CSV.");
          setLoading(false);
        }
      },
      error: () => {
        setError("Failed to parse CSV file.");
        setLoading(false);
      }
    });
  };

  // Helper to process and upload CSV file
  const processCSVFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setError("Only CSV files are allowed.");
      return;
    }
    setError("");
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Extract both 'Name' and 'Unit Code' columns for each property
          const rows = results.data;
          const properties = rows
            .map(row => {
              let ical = '';
              if (typeof row["iCal"] === "string" && row["iCal"].trim()) {
                ical = row["iCal"].trim();
              } else if (typeof row["iCal Link"] === "string" && row["iCal Link"].trim()) {
                ical = row["iCal Link"].trim();
              } else if (Array.isArray(results.meta && results.meta.fields) && results.meta.fields.length >= 46) {
                // Fallback: get the value from column AT (index 45)
                const fieldName = results.meta.fields[45];
                if (typeof row[fieldName] === "string" && row[fieldName].trim()) {
                  ical = row[fieldName].trim();
                }
              }

              // Address (Column J) support: try common header names, then fallback by index
              let address = '';
              const addressHeaders = [
                'Address',
                'Street Address',
                'Address 1',
                'Property Address',
                'Full Address'
              ];
              for (const key of addressHeaders) {
                if (typeof row[key] === 'string' && row[key].trim()) {
                  address = row[key].trim();
                  break;
                }
              }
              if (!address && Array.isArray(results.meta && results.meta.fields) && results.meta.fields.length >= 10) {
                // Column J is the 10th column -> index 9
                const addressField = results.meta.fields[9];
                if (typeof row[addressField] === 'string' && row[addressField].trim()) {
                  address = row[addressField].trim();
                }
              }

              // OR Website URL (Column AF) support: try common header names, then fallback by index
              let orUrl = '';
              const orUrlHeaders = [
                'OR URL',
                'OR Website URL',
                'OR Website',
                'Website',
                'Website URL',
                'Online URL'
              ];
              for (const key of orUrlHeaders) {
                if (typeof row[key] === 'string' && row[key].trim()) {
                  orUrl = row[key].trim();
                  break;
                }
              }
              if (!orUrl && Array.isArray(results.meta && results.meta.fields) && results.meta.fields.length >= 32) {
                // Column AF is the 32nd column -> index 31
                const orUrlField = results.meta.fields[31];
                if (typeof row[orUrlField] === 'string' && row[orUrlField].trim()) {
                  orUrl = row[orUrlField].trim();
                }
              }
              const { addressStreet, addressCity, addressZip } = parseAddressParts(address);
              return {
                name: typeof row["Name"] === "string" ? row["Name"].trim() : "",
                unitCode: typeof row["Unit Code"] === "string" ? row["Unit Code"].trim() : "",
                ical,
                address,
                orUrl,
                addressStreet,
                addressCity,
                addressZip
              };
            })
            .filter(obj => obj.name && obj.unitCode);
          const db = getFirestore(app);
          await setDoc(doc(db, "autocomplete", "propertyNames"), {
            names: properties
          });
          // Optionally backfill tasks' ical fields
          if (updateTasksChecked) {
            await updateTasksFromCSV(properties);
          }
          setLoading(false);
          setSuccess(true);
          onUpload(file);
          // Log action: property CSV upload
          try {
            const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
            await logAction({
              action: 'csv_upload_properties',
              userId: currentUser?.uid || '',
              userEmail: currentUser?.email || '',
              actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
              permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
              targetType: 'property',
              targetId: 'autocomplete/propertyNames',
              context: 'settings',
              severity: 'info',
              message: `Uploaded property CSV: ${file?.name || ''}`,
              metadata: { filename: file?.name || '', rowCount: Array.isArray(properties) ? properties.length : undefined, updateTasksChecked, limitToScheduling, overwriteExisting, allowExactNameMatch, device },
            });
          } catch (_) {}
          setTimeout(() => {
            setSuccess(false);
            onClose();
          }, 1800);
        
        } catch (err) {
          setError("Failed to upload property names.");
          setLoading(false);
        }
      },
      error: () => {
        setError("Failed to parse CSV file.");
        setLoading(false);
      }
    });
  };

  const handleFileChange = async e => {
    const file = e.target.files[0];
    processCSVFile(file);
  };

  const handleSecurityFileChange = async e => {
    const file = e.target.files[0];
    processSecurityCSVFile(file);
  };



  if (!open) return null;

  // Close modal if overlay is clicked
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      <FloatingBanner
        visible={success}
        message="Property names updated successfully!"
        type="success"
        autoHideDuration={1800}
      />
      <div
        onClick={handleOverlayClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "transparent",
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        width: "calc(100vw - 68px)",
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          color: "var(--text-main)",
          borderRadius: 12,
          padding: "32px",
          minWidth: 340,
          boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative"
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: 22 }}>Upload Data</h2>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => setMode('property')}
            className={mode === 'property' ? 'sw-seg active' : 'sw-seg'}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--button-border)',
              background: mode === 'property' ? 'var(--button-bg)' : 'transparent',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >Property Data</button>
          <button
            onClick={() => setMode('security')}
            className={mode === 'security' ? 'sw-seg active' : 'sw-seg'}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--button-border)',
              background: mode === 'security' ? 'var(--button-bg)' : 'transparent',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >Security Codes</button>
        </div>
        
        {mode === 'property' && (
        <div
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          onDragOver={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files[0];
            processCSVFile(file);
          }}
          style={{
            border: dragActive ? '2.5px solid #3b82f6' : '2.5px dashed #b8c6e6',
            background: dragActive ? 'rgba(59,130,246,0.08)' : 'var(--sidebar-bg, #232b3a)',
            borderRadius: 10,
            padding: '32px 12px',
            marginBottom: 18,
            width: '100%',
            minHeight: 90,
            textAlign: 'center',
            cursor: 'pointer',
            color: 'var(--text-main, #fff)',
            fontSize: 16,
            fontWeight: 500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            transition: 'border 0.18s, background 0.18s'
          }}
        >
          <FiUpload size={32} color={dragActive ? '#3b82f6' : '#b8c6e6'} style={{ marginBottom: 8 }} />
          <span style={{ fontWeight: 500 }}>
            {dragActive ? 'Drop your CSV file here...' : 'Drag and drop a CSV file here, or click to select'}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
        )}
        {mode === 'property' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, width: '100%' }}>
              <input
                type="checkbox"
                checked={updateTasksChecked}
                onChange={(e) => setUpdateTasksChecked(e.target.checked)}
              />
              <span style={{ fontSize: 14, color: 'var(--text-muted, #b8c6e6)' }}>
                Also update tasks missing iCal by matching CSV Unit Code or Name
              </span>
            </label>
            {updateTasksChecked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={!limitToScheduling}
                    onChange={(e) => setLimitToScheduling(!e.target.checked)}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-muted, #b8c6e6)' }}>
                    Update across all stages (uncheck to limit to Scheduling only)
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-muted, #b8c6e6)' }}>
                    Overwrite existing iCal values if different
                  </span>
                </label>
              </div>
            )}
          </>
        )}

        {mode === 'security' && (
        <div
          onClick={() => securityFileInputRef.current && securityFileInputRef.current.click()}
          onDragOver={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files[0];
            processSecurityCSVFile(file);
          }}
          style={{
            border: dragActive ? '2.5px solid #10b981' : '2.5px dashed #b8c6e6',
            background: dragActive ? 'rgba(16,185,129,0.08)' : 'var(--sidebar-bg, #232b3a)',
            borderRadius: 10,
            padding: '32px 12px',
            marginBottom: 18,
            width: '100%',
            minHeight: 90,
            textAlign: 'center',
            cursor: 'pointer',
            color: 'var(--text-main, #fff)',
            fontSize: 16,
            fontWeight: 500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            transition: 'border 0.18s, background 0.18s'
          }}
        >
          <FiUpload size={32} color={dragActive ? '#10b981' : '#b8c6e6'} style={{ marginBottom: 8 }} />
          <span style={{ fontWeight: 500 }}>
            {dragActive ? 'Drop your security codes CSV here...' : 'Drag and drop a security codes CSV here, or click to select'}
          </span>
          <input
            ref={securityFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleSecurityFileChange}
            style={{ display: 'none' }}
          />
        </div>
        )}
        {updateSummary && <div style={{ color: '#16a34a', marginBottom: 8 }}>{updateSummary}</div>}
        {error && <div style={{ color: "#c00", marginBottom: 8 }}>{error}</div>}
      </div>
    </div>
    </>
  );
}
