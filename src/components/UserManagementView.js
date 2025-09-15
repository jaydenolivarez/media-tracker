import ReactDOM from 'react-dom';
import React, { useState, useEffect, useRef } from "react";
import { getFirestore, collection, getDocs, updateDoc, doc, addDoc, arrayUnion } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { FiUsers } from "react-icons/fi";
import { FiMoreHorizontal, FiPlus } from 'react-icons/fi';
import PermissionsModal from "./PermissionsModal";
import RoleEditModal from "./RoleEditModal";
import { logAction } from "../utils/logAction";

import { FiUserCheck } from 'react-icons/fi';

const UserManagementView = () => {
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, userData } = useAuth();
  const isManager = userData && userData.roles.includes("manager");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  // Pending approval modal
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingRoleUpdates, setPendingRoleUpdates] = useState({}); // {userId: newRole}
  const [pendingAction, setPendingAction] = useState(null); // userId being processed

  // Role edit modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState(null);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("standard"); // legacy single-role (kept for backward compatibility where referenced)
  const [newRoles, setNewRoles] = useState(["standard"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const openModal = () => {
    setShowModal(true);
    setNewName("");
    setNewEmail("");
    setNewRole("standard");
    setNewRoles(["standard"]);
    setError("");
  };
  const closeModal = () => {
    setShowModal(false);
    setError("");
  };

  // Approve pending user
  const handleApprovePending = async (userId) => {
    const selected = pendingRoleUpdates[userId];
    const chosenRoles = Array.isArray(selected) && selected.length > 0
      ? selected
      : ['standard'];
    const legacy = chosenRoles[0];
    setPendingAction(userId);
    const db = getFirestore();
    // Compute prev roles from local state for diff
    const prevUser = (users || []).find(u => u.id === userId);
    const prevRoles = Array.isArray(prevUser?.roles) ? prevUser.roles : (prevUser?.role ? [prevUser.role] : []);
    await updateDoc(doc(db, 'users', userId), { role: legacy, roles: chosenRoles });
    setUsers(users => users.map(u => u.id === userId ? { ...u, role: legacy, roles: chosenRoles } : u));
    setPendingAction(null);
    // Log action: user_permissions_changed (approve pending)
    try {
      const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
      const added = chosenRoles.filter(r => !prevRoles.includes(r));
      const removed = prevRoles.filter(r => !chosenRoles.includes(r));
      await logAction({
        action: 'user_permissions_changed',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
        permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
        targetType: 'user',
        targetId: userId,
        context: 'user_management',
        severity: 'info',
        message: `Approved pending user; roles updated: +${added.join(',') || '-'} -${removed.join(',') || '-'}`,
        metadata: { beforeRoles: prevRoles, afterRoles: chosenRoles, added, removed, device },
      });
    } catch (_) {}
  };

  // Delete pending user
  const handleDeletePending = async (userId) => {
    setPendingAction(userId);
    const db = getFirestore();
    // Soft-delete: add 'deleted' to roles array (do not overwrite legacy role)
    try {
      await updateDoc(doc(db, 'users', userId), { roles: arrayUnion('deleted') });
    } catch (e) {}
    // Remove from local list to reflect filter immediately
    setUsers(users => users.filter(u => {
      const rolesArr = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
      return u.id !== userId && !rolesArr.includes('deleted');
    }));
    setPendingAction(null);
  };

  // User creation logic
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Full name is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const db = getFirestore();
      // Use email as Firestore doc id for uniqueness, or use auto-id and store email
      // Ensure at least one role is selected
      const chosenRoles = Array.isArray(newRoles) && newRoles.length > 0 ? newRoles : ([newRole].filter(Boolean));
      if (!chosenRoles || chosenRoles.length === 0) {
        setError("Please select at least one role.");
        setCreating(false);
        return;
      }
      const userDoc = {
        displayName: newName.trim(),
        email: newEmail ? newEmail : "",
        role: (chosenRoles[0] || "pending"),
        roles: chosenRoles,
        createdAt: new Date().toISOString(),
      };
      // Check for existing user by email if email is provided
      if (newEmail.trim()) {
        const exists = users.find(u => u.email && u.email.toLowerCase() === newEmail.trim().toLowerCase());
        if (exists) {
          setError("A user with this email already exists.");
          setCreating(false);
          return;
        }
      }
      // Add user with auto-generated id
      const dbCol = collection(db, "users");
      const docRef = await addDoc(dbCol, userDoc); // Firestore v9 modular: use addDoc
      setUsers(prev => [...prev, { ...userDoc, id: docRef.id }]);
      closeModal();
      // Log action: user_created
      try {
        const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
        await logAction({
          action: 'user_created',
          userId: user?.uid || '',
          userEmail: user?.email || '',
          actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
          targetType: 'user',
          targetId: docRef.id,
          context: 'user_management',
          severity: 'info',
          message: `Created user ${userDoc.email || userDoc.displayName}`,
          metadata: { createdUserId: docRef.id, email: userDoc.email, roles: userDoc.roles, device },
        });
      } catch (_) {}
    } catch (err) {
      setError("Failed to create user: " + (err.message || err.toString()));
    }
    setCreating(false);
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const db = getFirestore();
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filtered = list.filter(u => Array.isArray(u.roles) ? !u.roles.includes('deleted') : u.role !== 'deleted');
      setUsers(filtered);
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const handleRoleChange = async (uid, newRole) => {
    const db = getFirestore();
    await updateDoc(doc(db, "users", uid), { role: newRole });
    setUsers(users => users.map(u => u.id === uid ? { ...u, role: newRole } : u));
  };

  return (
    <div
      style={{
        marginLeft: '68px',
        width: 'auto',
        background: 'var(--bg-main)',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{
        fontSize: 28,
        fontWeight: 700,
        margin: '40px 0 28px',
        color: 'var(--text-main)',
        letterSpacing: 0.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: "var(--title-font)"
      }}>
        <FiUsers style={{ color: '#3b82f6', marginRight: 12, verticalAlign: 'middle' }} /> User Management
        {isManager && (
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              title="Approve Pending Users"
              aria-label="Approve Pending Users"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginLeft: 4,
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
              onClick={() => setShowPendingModal(true)}
            >
              <FiUserCheck style={{ color: '#10b981', fontSize: 22 }} />
            </button>
            {(() => {
              const pendingCount = (Array.isArray(users) ? users : []).filter(u => Array.isArray(u.roles) ? u.roles.includes('pending') : u.role === 'pending').length;
              if (!pendingCount) return null;
              const text = pendingCount > 99 ? '99+' : String(pendingCount);
              return (
                <span
                  title={`${pendingCount} pending`}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -10,
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '2px 6px',
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}
                >{text}</span>
              );
            })()}
          </div>
        )}
      </h2>
      {/* Pending Users Modal */}
      {showPendingModal && (
        <div
          onClick={() => setShowPendingModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(20,24,32,0.33)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #fff)',
              color: 'var(--text-main, #222)',
              borderRadius: 16,
              padding: '32px 28px 28px 28px',
              width: '45vw',
              boxShadow: '0 8px 48px 0 rgba(60,80,160,0.13)',
              border: '1.5px solid var(--sidebar-border, #e3e3e3)',
              position: 'relative',
              transition: 'background 0.2s, color 0.2s',
              animation: 'fadeInModal 0.22s cubic-bezier(.39,1.12,.37,1)'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 18, fontWeight: 700, color: 'var(--text-main)', fontSize: 22 }}>Approve Pending Users</h3>
            <button
              onClick={() => setShowPendingModal(false)}
              style={{ position: 'absolute', right: 18, top: 18, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary, #888)', borderRadius: 4, padding: 2, lineHeight: 1 }}
              title="Close"
              tabIndex={0}
              aria-label="Close Modal"
            >×</button>
            {users.filter(u => u.role === 'pending').length === 0 ? (
              <div style={{ color: 'var(--text-secondary, #888)', padding: 24 }}>No pending users.</div>
            ) : (
              <div>
                {users.filter(u => u.role === 'pending').map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--sidebar-border, #e3e3e3)', paddingBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{u.displayName || u.email || u.id}</div>
                      <div style={{ color: 'var(--text-secondary, #888)', fontSize: 13 }}>{u.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginRight: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {['manager','editor','photographer','standard'].map((r) => {
                        const current = pendingRoleUpdates[u.id];
                        const selected = Array.isArray(current) ? current : (current ? [current] : ['standard']);
                        const active = selected.includes(r);
                        const cap = r.charAt(0).toUpperCase() + r.slice(1);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setPendingRoleUpdates(prev => {
                                const cur = prev && prev[u.id];
                                const arr = Array.isArray(cur) ? cur : (cur ? [cur] : ['standard']);
                                const set = new Set(arr);
                                if (set.has(r)) set.delete(r); else set.add(r);
                                return { ...prev, [u.id]: Array.from(set) };
                              });
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 999,
                              border: active ? '2px solid #3b82f6' : '1.5px solid var(--sidebar-border, #e3e3e3)',
                              background: active ? '#3b82f6' : 'var(--bg-main, #f5f7fa)',
                              color: active ? '#fff' : 'var(--text-main, #222)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >{cap}</button>
                        );
                      })}
                    </div>
                    <button
                      disabled={pendingAction === u.id}
                      onClick={() => handleApprovePending(u.id)}
                      style={{ background: 'var(--accent-green, #10b981)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 600, marginRight: 6, cursor: 'pointer', transition: 'background 0.18s' }}
                    >Approve</button>
                    <button
                      disabled={pendingAction === u.id}
                      onClick={() => handleDeletePending(u.id)}
                      style={{ background: 'var(--accent-red, #e11d48)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.18s' }}
                    >Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#888', fontSize: 16, marginTop: 48 }}>Loading users...</div>
      ) : (
        <div style={{
          width: '100%',
          maxWidth: 980,
          margin: '0 auto',
          borderRadius: 20,
          boxShadow: '0 8px 48px 0 rgba(60,80,160,0.13)',
          background: 'var(--bg-card)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 320,
          position: 'relative',
        }}>
          {/* Plus button */}
          <button
            title="Add User"
            onClick={openModal}
            style={{
              position: 'absolute',
              top: 12,
              right: 18,
              background: 'var(--sidebar-bg, #f5f7fa)',
              border: 'none',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(80,120,200,0.08)',
              cursor: 'pointer',
              color: '#3b82f6',
              zIndex: 10,
              transition: 'background 0.14s',
            }}
          >
            <FiPlus size={20} />
          </button>

          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', height: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, background: 'var(--bg-card)', tableLayout: 'fixed', fontSize: 16, minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', color: 'var(--text-main)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ width: '30%', padding: '18px 14px', fontWeight: 700, fontSize: 16, textAlign: 'left', borderBottom: '2.5px solid var(--sidebar-border, #e3e3e3)', letterSpacing: 0.2 }}>Display Name</th>
                  <th style={{ width: '35%', padding: '18px 14px', fontWeight: 700, fontSize: 16, textAlign: 'left', borderBottom: '2.5px solid var(--sidebar-border, #e3e3e3)', letterSpacing: 0.2 }}>Email</th>
                  <th style={{ width: '25%', padding: '18px 14px', fontWeight: 700, fontSize: 16, textAlign: 'left', borderBottom: '2.5px solid var(--sidebar-border, #e3e3e3)', letterSpacing: 0.2 }}>Role</th>
                  <th style={{ width: '10%', borderBottom: '2.5px solid var(--sidebar-border, #e3e3e3)' }}></th>
                  

                </tr>
              </thead>
              <tbody>
                {(
                  (Array.isArray(users) ? users : []).filter(u => Array.isArray(u.roles) ? !u.roles.includes('deleted') : u.role !== 'deleted')
                ).map((u, idx) => (
                  <tr
                    key={u.id}
                    style={{
                      background: idx % 2 === 0 ? 'var(--bg-main)' : 'var(--bg-card)',
                      transition: 'background 0.18s',
                      borderBottom: '1.5px solid var(--sidebar-border, #e3e3e3)',
                      cursor: 'default',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(120,130,160,0.10)')}
                    onMouseOut={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-main)' : 'var(--bg-card)')}
                  >
                    <td style={{ width: '30%', padding: '14px 14px', fontWeight: 600, color: 'var(--text-main)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || '-'}</td>
                    <td style={{ width: '35%', padding: '14px 14px', fontWeight: 400, color: 'var(--text-main)', maxWidth: 270, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '-'}</td>
                    <td style={{ width: '25%', padding: '10px 14px', minWidth: 170 }}>
                      {(() => {
                        const rolesArr = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
                        const cap = (s) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '';
                        const main = rolesArr[0] ? cap(rolesArr[0]) : '—';
                        const extraCount = Math.max(rolesArr.length - 1, 0);
                        const label = extraCount > 0 ? `${main} & ${extraCount} more` : main;
                        const canEditThis = isManager && u.id !== userData.id;
                        return (
                          <span
                            role={canEditThis ? 'button' : undefined}
                            title={canEditThis ? 'Edit Roles' : 'You cannot edit your own roles'}
                            onClick={() => { if (canEditThis) { setRoleModalUser(u); setRoleModalOpen(true); } }}
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-main)',
                              cursor: canEditThis ? 'pointer' : 'default',
                              textDecoration: canEditThis ? 'underline' : 'none',
                              padding: canEditThis ? '4px 2px' : 0,
                              borderRadius: 6,
                            }}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ width: '10%', padding: '10px 0', textAlign: 'center', position: 'relative' }}>
                      {u.id !== userData.id ? (
                        <MoreOptionsMenu
                          userId={u.id}
                          userObj={u}
                          currentUserId={userData?.id}
                          onEditPermissions={(userObj) => { setSelectedUser(userObj); setShowPermissionsModal(true); }}
                          setUsers={setUsers}
                        />
                      ) : null}
                    </td>
                    
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <PermissionsModal
        open={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        user={selectedUser}
        onSave={async (newPermissions) => {
          if (!selectedUser) return;
          const db = getFirestore();
          const before = selectedUser?.permissions || {};
          await updateDoc(doc(db, "users", selectedUser.id), { permissions: newPermissions });
          setUsers(users => users.map(u => u.id === selectedUser.id ? { ...u, permissions: newPermissions } : u));
          // Log action: user_permissions_changed (permissions map)
          try {
            const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
            const after = newPermissions || {};
            const beforeKeys = Object.keys(before || {});
            const afterKeys = Object.keys(after || {});
            const changedKeys = Array.from(new Set([...beforeKeys, ...afterKeys])).filter(k => (before?.[k] ?? null) !== (after?.[k] ?? null));
            await logAction({
              action: 'user_permissions_changed',
              userId: user?.uid || '',
              userEmail: user?.email || '',
              actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
              permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
              targetType: 'user',
              targetId: selectedUser.id,
              context: 'user_management',
              severity: 'info',
              message: `Updated permissions for ${selectedUser?.email || selectedUser?.id}`,
              metadata: { changedKeys, before, after, device },
            });
          } catch (_) {}
        }}
        // DEBUG: Log when modal renders and with what props
        
      />
      <RoleEditModal
        open={roleModalOpen}
        onClose={() => { setRoleModalOpen(false); setRoleModalUser(null); }}
        user={roleModalUser}
        currentUserId={userData?.id}
        onSaved={(payload) => {
          if (!payload || !payload.id) return;
          setUsers(prev => prev.map(u => u.id === payload.id ? { ...u, roles: payload.roles, role: payload.role } : u));
        }}
      />
      {/* Modal for user creation */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.14)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
          onClick={closeModal}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleCreateUser}
            style={{
              boxShadow: '0 4px 32px rgba(60,80,160,0.16)',
              padding: 32,
              minWidth: 340,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              position: 'relative',
              color: 'var(--text-main, #f3f4f6)',
              background: 'var(--bg-card)',
              borderRadius: 16,
            }}
          >
          {/* Ensure placeholder text is visible in dark mode */}
          <style>{`
            form input::placeholder {
              color: #aeb5c7;
              opacity: 1;
            }
          `}</style>
          <button
            type="button"
            onClick={closeModal}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: 'none',
              fontSize: 24,
              color: '#aaa',
              cursor: 'pointer',
            }}
            aria-label="Close"
          >×</button>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>Add New User</h3>
          <label style={{ fontWeight: 600, fontSize: 15, width: '100%', display: 'block', marginBottom: 6 }}>
            Full Name
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 8,
                borderRadius: 7,
                border: '1.5px solid var(--sidebar-border, #3b4252)',
                marginTop: 4,
                marginBottom: 8,
                fontSize: 15,
                background: 'var(--bg-main, #23272f)',
                color: 'var(--text-main, #f3f4f6)'
              }}
              placeholder="Enter full name"
              required
            />
          </label>
          <label style={{ fontWeight: 600, fontSize: 15, width: '100%', display: 'block', marginBottom: 6 }}>
            Email
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 8,
                borderRadius: 7,
                border: '1.5px solid var(--sidebar-border, #3b4252)',
                marginTop: 4,
                marginBottom: 8,
                fontSize: 15,
                background: 'var(--bg-main, #23272f)',
                color: 'var(--text-main, #f3f4f6)'
              }}
              placeholder="Enter email"
            />
          </label>
          <div style={{ fontWeight: 600, fontSize: 15, width: '100%', display: 'block', marginBottom: 6 }}>
            Roles
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {['manager','editor','photographer','standard','pending'].map((r) => {
                const active = (newRoles || []).includes(r);
                const cap = r.charAt(0).toUpperCase() + r.slice(1);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setNewRoles(prev => {
                        const set = new Set(prev || []);
                        if (set.has(r)) set.delete(r); else set.add(r);
                        return Array.from(set);
                      });
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: active ? '2px solid #3b82f6' : '1.5px solid var(--sidebar-border, #3b4252)',
                      background: active ? '#3b82f6' : 'var(--bg-main, #23272f)',
                      color: active ? '#fff' : 'var(--text-main, #f3f4f6)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >{cap}</button>
                );
              })}
            </div>
          </div>
          {error && <div style={{ color: '#b82e2e', fontWeight: 500, marginTop: -8 }}>{error}</div>}
          <button
            type="submit"
            disabled={creating || !(Array.isArray(newRoles) && newRoles.length > 0)}
            style={{
              marginTop: 8,
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontWeight: 700,
              fontSize: 16,
              cursor: (creating || !(Array.isArray(newRoles) && newRoles.length > 0)) ? 'not-allowed' : 'pointer',
              opacity: (creating || !(Array.isArray(newRoles) && newRoles.length > 0)) ? 0.7 : 1,
              transition: 'background 0.18s',
            }}
          >{creating ? 'Creating...' : 'Create User'}</button>
        </form>
      </div>
    )}
  </div>
  );
};



function MoreOptionsMenu({ userId, onEditPermissions, userObj, setUsers, currentUserId }) {
  const { user, userData } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  async function handleDeleteUser() {
    setDeleting(true);
    try {
      setOpen(false);
      const db = getFirestore();
      // Soft-delete: add 'deleted' to roles array
      await updateDoc(doc(db, 'users', userId), { roles: arrayUnion('deleted') });
      // Remove from local list immediately
      setUsers(users => users.filter(u => u.id !== userId));
      // Log action: user_deleted (soft delete)
      try {
        const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
        await logAction({
          action: 'user_deleted',
          userId: user?.uid || '',
          userEmail: user?.email || '',
          actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
          targetType: 'user',
          targetId: userId,
          context: 'user_management',
          severity: 'critical',
          message: `Soft-deleted user ${userObj?.email || userId}`,
          metadata: { method: 'soft_delete_flag', email: userObj?.email || '', device },
        });
      } catch (_) {}
    } catch (err) {
      alert('Failed to delete user: ' + (err.message || err.toString()));
    } finally {
      setDeleting(false);
    }
  }
  

  // Compute and update the menu position relative to the trigger button
  const computeMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const MENU_WIDTH = 180; // matches style width below
    const ESTIMATED_MENU_HEIGHT = 120; // rough estimate; will be clamped within viewport
    // Prefer dropdown below the button; align right edges
    let top = rect.bottom + 8;
    let left = rect.right - MENU_WIDTH;
    // Clamp horizontally within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - 8 - MENU_WIDTH));
    // If not enough space below, flip above
    if (top + ESTIMATED_MENU_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 8 - ESTIMATED_MENU_HEIGHT);
    }
    setMenuPos({ top, left });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      const menuEl = menuRef.current;
      const btnEl = buttonRef.current;
      if (
        open &&
        menuEl &&
        !menuEl.contains(event.target) &&
        btnEl &&
        !btnEl.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function handleScrollOrResize() {
      if (open) computeMenuPosition();
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      // Initial position
      computeMenuPosition();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label="More options"
        style={{
          background: 'none',
          border: 'none',
          borderRadius: 6,
          padding: 6,
          cursor: 'pointer',
          color: 'var(--text-main)',
          transition: 'background 0.15s',
        }}
        ref={buttonRef}
        onClick={() => {
          setOpen(o => {
            const next = !o;
            if (next) {
              // Compute immediately so there is no jump
              setTimeout(computeMenuPosition, 0);
            }
            return next;
          });
        }}
      >
        <FiMoreHorizontal size={22} />
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: 180,
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            boxShadow: '0 8px 24px 0 rgba(60,80,160,0.13)',
            border: '1px solid var(--sidebar-border, #e3e3e3)',
            borderRadius: 12,
            zIndex: 10000,
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            alignItems: 'stretch',
          }}
        >
    
    <button
      style={{
        width: '100%',
        background: 'none',
        border: 'none',
        padding: '10px 18px',
        textAlign: 'left',
        color: 'var(--text-main)',
        cursor: 'pointer',
        fontWeight: 500,
        borderRadius: 8,
        transition: 'background 0.13s, color 0.13s',
      }}
      title={userId === currentUserId ? 'You cannot edit your own additional permissions' : 'Additional Permissions'}
      disabled={userId === currentUserId}
      onMouseDown={() => {
        if (userId === currentUserId) return;
        setOpen(false);
        if (onEditPermissions && userObj) {
          onEditPermissions(userObj);
        }
      }}
      onMouseOver={e => {
        if (userId === currentUserId) return;
        e.currentTarget.style.background = '#e3f0ff';
        e.currentTarget.style.color = '#2366b8';
      }}
      onMouseOut={e => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = 'var(--text-main)';
      }}
    >
      Additional Permissions
    </button>
    <button
      style={{
        width: '100%',
        background: 'none',
        border: 'none',
        padding: '10px 18px',
        textAlign: 'left',
        color: '#d32f2f',
        cursor: 'pointer',
        fontWeight: 500,
        borderRadius: 8,
        transition: 'background 0.13s',
      }}
      disabled={deleting}
      onClick={() => setShowConfirmDelete(true)}
      onMouseOver={e => e.currentTarget.style.background = 'rgba(227,76,76,0.08)'}
      onMouseOut={e => e.currentTarget.style.background = 'none'}
    >
      Delete User
    </button>
    {showConfirmDelete && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.32)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          background: 'var(--bg-card)',
          color: 'var(--text-main)',
          borderRadius: 12,
          boxShadow: '0 8px 24px 0 rgba(60,80,160,0.13)',
          minWidth: 320,
          maxWidth: '90vw',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Delete User?</div>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            Are you sure you want to delete this user profile? This action cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => setShowConfirmDelete(false)}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--bg-secondary)',
                color: 'var(--text-main)',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: 16,
                marginRight: 8,
              }}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await handleDeleteUser();
                setShowConfirmDelete(false);
              }}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: '#d32f2f',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 16,
                opacity: deleting ? 0.7 : 1,
              }}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default UserManagementView;
