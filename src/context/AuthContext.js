import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [userManager, setUserManager] = useState(false);
  const [userData, setUserData] = useState(null);
  // New multi-role support
  const [roles, setRoles] = useState([]); // e.g., ["manager", "photographer"]
  const [activeRole, setActiveRole] = useState(null); // current UI mode

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setRoleLoading(true);
        try {
          const db = getFirestore();
          // Firestore connection test
          try {
            await getDoc(doc(db, "__connection_test", "test"));
          } catch (connErr) {
            console.error("[Firestore] Connection test failed:", connErr);
          }
          const userRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            const singleRole = data.role || null;
            const multiRoles = Array.isArray(data.roles) ? data.roles : (singleRole ? [singleRole] : []);
            setRole(singleRole);
            setRoles(multiRoles);
            setUserManager(!!data.user_manager);
            setUserData({ id: userDoc.id, ...data });
          } else {
            setUserManager(false);
            // Create new user document with role based on email domain
            let assignedRole = "pending";
            if ((currentUser.email || "").endsWith("@oceanreefresorts.com")) {
              assignedRole = "standard";
            }
            await setDoc(userRef, {
              displayName: currentUser.displayName || "",
              email: currentUser.email || "",
              role: assignedRole,
              createdAt: new Date().toISOString(),
            });
            setRole(assignedRole);
            setRoles(assignedRole ? [assignedRole] : []);
            setUserData({
              id: userRef.id,
              displayName: currentUser.displayName || "",
              email: currentUser.email || "",
              role: assignedRole,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          setRole(null);
          setRoles([]);
          setUserManager(false);
        }
        setRoleLoading(false);
      } else {
        setRole(null);
        setRoles([]);
        setActiveRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper to refresh Firestore userData (e.g. after permissions update)
  const refreshUserData = async () => {
    if (user) {
      const db = getFirestore();
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({ id: userDoc.id, ...data });
        const singleRole = data.role || null;
        const multiRoles = Array.isArray(data.roles) ? data.roles : (singleRole ? [singleRole] : []);
        setRole(singleRole);
        setRoles(multiRoles);
      }
    }
  };

  // Keep activeRole in sync with available roles and persist choice
  useEffect(() => {
    if (!roles || roles.length === 0) {
      setActiveRole(null);
      return;
    }
    // Restore preferred role if valid, else default to first available
    const saved = localStorage.getItem("activeRole");
    if (saved && roles.includes(saved)) {
      setActiveRole(saved);
    } else {
      setActiveRole(roles[0]);
      localStorage.setItem("activeRole", roles[0]);
    }
  }, [roles]);

  const setActiveRoleSafe = (r) => {
    if (r && roles.includes(r)) {
      setActiveRole(r);
      localStorage.setItem("activeRole", r);
    }
  };

  // Permission helpers
  const hasRole = (r) => roles.includes(r);
  const hasAnyRole = (rs = []) => rs.some((r) => roles.includes(r));

  return (
    <AuthContext.Provider value={{
      user,
      currentUser: user, // backward-compat alias
      loading,
      role, // legacy single-role
      roles, // new multi-role array
      activeRole,
      setActiveRole: setActiveRoleSafe,
      hasRole,
      hasAnyRole,
      roleLoading,
      userManager,
      userData,
      refreshUserData,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
