// Helper to get display name from user info that may be a string (UID) or object ({ uid, displayName })
// usersList: optional array of user objects to look up displayName by UID
export function getUserDisplayName(user, usersList = []) {
  if (!user) return "";
  // If user is a string, treat as UID
  if (typeof user === "string") {
    const userObj = usersList.find(u => u.id === user || u.uid === user);
    return userObj ? (userObj.displayName || userObj.email || userObj.id || userObj.uid) : user;
  }
  // If user is an object with displayName
  if (typeof user === "object") {
    return user.displayName || user.email || user.uid || JSON.stringify(user);
  }
  // Fallback
  return String(user);
}
