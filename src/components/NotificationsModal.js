import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext"
import { logAction } from "../utils/logAction";
import { FiPlus, FiX } from "react-icons/fi";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import AdminDebugNotificationToggle from "./AdminDebugNotificationToggle";
import { MEDIA_TYPES } from "../constants/mediaTypes";

const iconBtnStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--sidebar-border)',
  fontSize: 18,
  borderRadius: '50%',
  cursor: 'pointer',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 4,
  marginRight: 2,
  lineHeight: 1,
  outline: 'none',
  userSelect: 'none',
  transition: 'background 0.15s, border 0.15s',
};

const iconBtnBase = {
  background: 'none',
  border: 'none',
  fontSize: 20,
  borderRadius: '50%',
  cursor: 'pointer',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 4,
  marginRight: 2,
  lineHeight: 1,
  outline: 'none',
  userSelect: 'none',
  transition: 'background 0.15s, border 0.15s',
};
const iconBtnAddStyle = {
  ...iconBtnBase,
  color: 'var(--primary, #22a06b)',
};
const iconBtnRemoveStyle = {
  ...iconBtnBase,
  color: 'var(--danger, #c00)',
};

const groupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 0 0 0',
};

const dropdownHeaderStyle = {
  cursor: 'pointer',
  padding: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontWeight: 700,
  fontSize: 17,
  letterSpacing: '-0.2px',
  color: 'var(--text-main)',
  borderBottom: '1px solid var(--sidebar-border)',
  background: 'transparent',
  borderRadius: 8,
  transition: 'background 0.15s',
};

export default function NotificationsModal({ open, onClose, onSuccess }) {
  const { userData } = useAuth();
  const [hoveredDropdown, setHoveredDropdown] = useState(null);

  const notificationTypes = [
    {
      key: "mediaRequestCreation",
      label: "Media Request Creation",
    },
    {
      key: "taskCompletion",
      label: "Task Completion",
    },
    {
      key: "shootingCompletion",
      label: "Shooting Completion",
    },
    {
      key: "editingCompletion",
      label: "Editing Completed",
    },
    {
      key: "issueCreation",
      label: "Issue Creation",
    },
    {
      key: "taskComment",
      label: "Task Comment (Task Lookup Page)",
    },
    {
      key: "stagnantTaskRecipients",
      label: "Stagnant Task",
    },
    {
      key: "priorityRequestRecipients",
      label: "Priority Request",
    }
  ];
  const [collapse, setCollapse] = useState({});
  // Each entry is { email: string, mediaTypes?: string[] } for all lists.
  const [emails, setEmails] = useState({
    mediaRequestCreation: [{ email: "", mediaTypes: [] }],
    taskCompletion: [{ email: "", mediaTypes: [] }],
    shootingCompletion: [{ email: "", mediaTypes: [] }],
    editingCompletion: [{ email: "", mediaTypes: [] }],
    issueCreation: [{ email: "", mediaTypes: [] }],
    taskComment: [{ email: "", mediaTypes: [] }],
    stagnantTaskRecipients: [{ email: "", mediaTypes: [] }],
    priorityRequestRecipients: [{ email: "", mediaTypes: [] }]
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // Stagnant threshold state
  const [stagnantTaskThresholdDays, setStagnantTaskThresholdDays] = useState(14);


  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setSuccess(false);
    const fetchEmails = async () => {
      try {
        const db = getFirestore();
        // Fetch standard notification recipients
        const docRef = doc(db, "notifications", "settings");
        const docSnap = await getDoc(docRef);
        // Fetch stagnantTaskRecipients and priorityRequestRecipients from config/notifications
        let stagnantArr = [{ email: "", mediaTypes: [] }];
        let priorityArr = [{ email: "", mediaTypes: [] }];
        if (userData?.roles?.includes('manager')) {
          const configRef = doc(db, "config", "notifications");
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const convertToObjects = (list) => {
              if (!Array.isArray(list)) return [{ email: "", mediaTypes: [] }];
              return list.map((entry) => {
                if (typeof entry === "string") return { email: entry, mediaTypes: [] };
                if (entry && typeof entry === "object") {
                  const email = (entry.email || "").toString();
                  const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes.filter(Boolean) : [];
                  return { email, mediaTypes };
                }
                return { email: "", mediaTypes: [] };
              }).filter(e => e.email || e.mediaTypes?.length);
            };
            stagnantArr = convertToObjects(configSnap.data().stagnantTaskRecipients);
            priorityArr = convertToObjects(configSnap.data().priorityRequestRecipients);
            // Fetch stagnantTaskThresholdDays
            if (typeof configSnap.data().stagnantTaskThresholdDays === 'number') {
              setStagnantTaskThresholdDays(configSnap.data().stagnantTaskThresholdDays);
            } else {
              setStagnantTaskThresholdDays(14);
            }
          } else {
            setStagnantTaskThresholdDays(14);
          }
        }
        const data = docSnap.exists() ? docSnap.data() : {};
        const convertToObjects = (list) => {
          // Backward compatibility:
          // - If list is array of strings, map to [{email, mediaTypes: []}] (empty => all)
          // - If list is array of objects, keep as-is but normalize shape
          if (!Array.isArray(list)) return [{ email: "", mediaTypes: [] }];
          return list.map((entry) => {
            if (typeof entry === "string") return { email: entry, mediaTypes: [] };
            if (entry && typeof entry === "object") {
              const email = (entry.email || "").toString();
              const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes.filter(Boolean) : [];
              return { email, mediaTypes };
            }
            return { email: "", mediaTypes: [] };
          }).filter(e => e.email || e.mediaTypes?.length);
        };
        setEmails({
          mediaRequestCreation: convertToObjects(data.mediaRequestCreation || [""]),
          taskCompletion: convertToObjects(data.taskCompletion || [""]),
          shootingCompletion: convertToObjects(data.shootingCompletion || [""]),
          editingCompletion: convertToObjects(data.editingCompletion || [""]),
          issueCreation: convertToObjects(data.issueCreation || [""]),
          taskComment: convertToObjects(data.taskComment || [""]),
          stagnantTaskRecipients: stagnantArr,
          priorityRequestRecipients: priorityArr,
        });
      } catch (e) {
        setError("Failed to load notification emails.");
      }
      setLoading(false);
    };
    fetchEmails();
  }, [open, userData?.role]);

  const handleEmailChange = (type, idx, value) => {
    setEmails(prev => {
      const arr = [...prev[type]];
      const obj = { ...(arr[idx] || { email: '', mediaTypes: [] }) };
      obj.email = value;
      arr[idx] = obj;
      return { ...prev, [type]: arr };
    });
    setSuccess(false);
  };

  const handleAddEmail = type => {
    setEmails(prev => ({
      ...prev,
      [type]: [
        ...prev[type],
        { email: "", mediaTypes: [] }
      ]
    }));
  };

  const handleRemoveEmail = (type, idx) => {
    setEmails(prev => {
      const arr = [...prev[type]];
      arr.splice(idx, 1);
      const fallback = [{ email: "", mediaTypes: [] }];
      return { ...prev, [type]: arr.length ? arr : fallback };
    });
  };

  const handleCollapse = key => {
    setCollapse(c => ({ ...c, [key]: !c[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const db = getFirestore();
      const docRef = doc(db, "notifications", "settings");
      // Normalize: store objects {email, mediaTypes?: string[]}.
      const normalizeList = (list) =>
        list
          .map((entry) => {
            if (typeof entry === 'string') return { email: entry, mediaTypes: [] };
            const email = (entry.email || '').trim();
            const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes.filter(Boolean) : [];
            if (!email) return null;
            return mediaTypes.length ? { email, mediaTypes } : { email };
          })
          .filter(Boolean);
      await setDoc(docRef, {
        mediaRequestCreation: normalizeList(emails.mediaRequestCreation),
        taskCompletion: normalizeList(emails.taskCompletion),
        shootingCompletion: normalizeList(emails.shootingCompletion),
        editingCompletion: normalizeList(emails.editingCompletion),
        issueCreation: normalizeList(emails.issueCreation),
        taskComment: normalizeList(emails.taskComment),
      }, { merge: true });
      // Save stagnantTaskRecipients and priorityRequestRecipients to config/notifications if manager
      if (userData?.roles?.includes('manager')) {
        const configRef = doc(db, "config", "notifications");
        await setDoc(configRef, {
          stagnantTaskRecipients: normalizeList(emails.stagnantTaskRecipients),
          stagnantTaskThresholdDays: stagnantTaskThresholdDays,
          priorityRequestRecipients: normalizeList(emails.priorityRequestRecipients)
        }, { merge: true });
      }
      if (onSuccess) onSuccess();
      onClose();
      // Log action: notifications recipients update
      try {
        const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
        const changedKeys = Object.keys(emails).filter(k => {
          const arr = emails[k];
          if (!Array.isArray(arr)) return false;
          return arr.some((entry) => {
            if (!entry) return false;
            if (typeof entry === 'string') return entry.trim().length > 0;
            return !!(entry.email && entry.email.toString().trim());
          });
        });
        await logAction({
          action: 'notifications_update_recipients',
          userId: userData?.id || '',
          userEmail: userData?.email || '',
          actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
          targetType: 'notifications',
          targetId: 'settings',
          context: 'settings',
          severity: 'info',
          message: 'Updated notification recipients',
          metadata: { changedKeys, emails, stagnantTaskThresholdDays, device },
        });
      } catch (_) {}
    } catch (e) {
      setError("Failed to save emails.");
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div style={modalBackdropStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...modalStyle, display: 'flex', flexDirection: 'column', maxHeight: '90vh', minHeight: 0, overflow: 'hidden' }}>
        <button aria-label="Close" onClick={onClose} style={closeBtnStyle}>&times;</button>
        <h2 style={{ margin: 0, fontWeight: 700, color: "var(--text-main)", fontSize: 22, marginBottom: 18, textAlign: 'center', letterSpacing: '-0.5px' }}>
          Notification Management
        </h2>
        {/* Admin Debug Notification Toggle */}
        <div style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
          {userData?.permissions?.adminTesting && (
            <AdminDebugNotificationToggle />
          )}
        </div>
        
        <style>{`
          .notif-modal-scroll::-webkit-scrollbar {
            width: 10px;
          }
          .notif-modal-scroll::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb, #c1c8d1);
            border-radius: 8px;
          }
          .notif-modal-scroll::-webkit-scrollbar-track {
            background: var(--scrollbar-track, transparent);
          }
          .notif-modal-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-thumb, #c1c8d1) var(--scrollbar-track, transparent);
          }
        `}</style>
        <div
          className="notif-modal-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>Loading...</div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); handleSave(); }} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {notificationTypes
              .filter(type => {
                if (type.key === 'stagnantTaskRecipients' || type.key === 'priorityRequestRecipients') {
                  return userData?.roles?.includes('manager');
                }
                return true;
              })
              .map(type => {
                const arr = emails[type.key] || [{ email: "", mediaTypes: [] }];
                const emailsArr = arr.filter(e => e && (e.email || '').toString().trim());
                return (
                  <div key={type.key} style={{ border: '1px solid var(--sidebar-border)', borderRadius: 10, marginBottom: 16, background: 'var(--bg-card)' }}>
                    <div
                      style={{
                        ...dropdownHeaderStyle,
                      background: hoveredDropdown === type.key
                        ? (typeof window !== 'undefined' && window.document?.documentElement?.getAttribute('data-theme') === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : '#f7faff')
                        : 'transparent',
                    }}
                    onClick={() => handleCollapse(type.key)}
                    onMouseEnter={() => setHoveredDropdown(type.key)}
                    onMouseLeave={() => setHoveredDropdown(null)}
                  >
                    <span>{type.label}</span>
                    <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-main)' }}>
                      {collapse[type.key] ? '▲' : '▼'}
                      {!collapse[type.key] && emailsArr.length > 0 && (
                        <span style={{ marginLeft: 10, color: 'var(--text-main)', fontSize: 13 }}>
                          {emailsArr.length} recipient{emailsArr.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </div>
                  {collapse[type.key] && (
                    <div style={groupStyle}>
                      <div style={{ color: 'var(--text-main)', fontSize: 13, marginBottom: 6 }}>{type.description}</div>
                      {type.key === 'stagnantTaskRecipients' && userData?.roles?.includes('manager') && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ marginLeft: 8 }}>
                            <label style={{ ...labelStyle, marginBottom: 2 }}>Days before notification is sent:</label>
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={stagnantTaskThresholdDays}
                            onChange={e => setStagnantTaskThresholdDays(Number(e.target.value))}
                            style={{ ...inputStyle, width: 80, display: 'inline-block', marginBottom: 0, marginRight: 10, marginLeft: 8 }}
                          />
                          </div>
                        </div>
                      )}
                      {arr.map((entry, idx) => {
                        const emailVal = entry?.email || '';
                        const mediaTypes = entry?.mediaTypes || [];
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 0, gap: 8, flexWrap: 'nowrap', width: '100%', overflow: 'hidden' }}>
                            <input
                              type="email"
                              value={emailVal}
                              onChange={e => handleEmailChange(type.key, idx, e.target.value)}
                              style={{ ...inputStyle, marginBottom: 0, flex: '0 0 320px' }}
                              className="global-input"
                              placeholder="Enter email"
                              required={emailsArr.length === 0 && idx === 0}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', padding: '0 6px', overflowX: 'auto' }}>
                                {MEDIA_TYPES.map(mt => {
                                  const selected = mediaTypes.includes(mt.key);
                                  return (
                                    <button
                                      type="button"
                                      key={mt.key}
                                      onClick={() => {
                                        setEmails(prev => {
                                          const next = [...prev[type.key]];
                                          const cur = { ...(next[idx] || { email: '', mediaTypes: [] }) };
                                          const set = new Set(Array.isArray(cur.mediaTypes) ? cur.mediaTypes : []);
                                          if (set.has(mt.key)) {
                                            set.delete(mt.key);
                                          } else {
                                            set.add(mt.key);
                                          }
                                          cur.mediaTypes = Array.from(set);
                                          next[idx] = cur;
                                          return { ...prev, [type.key]: next };
                                        });
                                      }}
                                      style={{
                                        borderRadius: 14,
                                        padding: '6px 10px',
                                        border: selected ? '1.5px solid #2563eb' : '1.5px solid var(--sidebar-border)',
                                        background: selected ? 'rgba(37,99,235,0.12)' : 'transparent',
                                        color: 'var(--text-main)',
                                        fontSize: 12,
                                        cursor: 'pointer'
                                      }}
                                      aria-pressed={selected}
                                    >{mt.label}</button>
                                  );
                                })}
                                <span style={{ fontSize: 12, color: 'var(--label-text, #6b7a90)', whiteSpace: 'nowrap' }}>
                                  {mediaTypes?.length ? `${mediaTypes.length} selected` : 'All types'}
                                </span>
                              </div>
                            {arr.length > 1 && (
                              <button type="button" aria-label="Remove" onClick={() => handleRemoveEmail(type.key, idx)} style={iconBtnRemoveStyle}><FiX /></button>
                            )}
                            {idx === arr.length - 1 && (
                              <button type="button" aria-label="Add" onClick={() => handleAddEmail(type.key)} style={iconBtnAddStyle}><FiPlus /></button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {error && <div style={{ color: 'var(--error)', margin: '8px 0', fontWeight: 500 }}>{error}</div>}
          </form>
        )}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginBottom: 12, marginTop: 12 }}>
              <button type="button" onClick={onClose} style={cancelBtnStyle} disabled={saving}>Cancel</button>
              <button type="button" onClick={handleSave} style={saveBtnStyle} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
      </div>
    </div>
  );
}

const modalBackdropStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  background: "transparent",
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "calc(100vw - 68px)",
  overflow: 'hidden',
};

const modalStyle = {
  background: "var(--bg-card)",
  borderRadius: 14,
  boxShadow: "0 4px 24px rgba(80,120,200,0.15)",
  padding: "32px 28px 24px 28px",
  minWidth: 640,
  maxWidth: "96vw",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  position: "relative"
};

const inputStyle = {
  borderRadius: 8,
  border: "1.5px solid var(--sidebar-border)",
  padding: "12px 10px",
  fontSize: 16,
  marginBottom: 18,
  background: "var(--bg-main)",
  color: "var(--text-main)",
  width: "100%",
  boxSizing: "border-box"
};

const labelStyle = {
  color: "var(--label-text, #6b7a90)",
  fontWeight: 500,
  marginBottom: 4,
  marginTop: 4,
  alignSelf: "flex-start"
};

const cancelBtnStyle = {
  background: "var(--sidebar-bg)",
  border: "1.5px solid var(--sidebar-border)",
  color: "var(--text-main)",
  borderRadius: 8,
  padding: "7px 18px",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer"
};

const saveBtnStyle = {
  background: "#3b82f6",
  border: "none",
  color: "#fff",
  borderRadius: 8,
  padding: "7px 18px",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer"
};

const closeBtnStyle = {
  position: "absolute",
  top: 18,
  right: 18,
  background: "none",
  border: "none",
  color: "#888",
  fontSize: 22,
  cursor: "pointer"
};
