// Removed duplicate import. See below for unified import.
import TaskTable from "./TaskTable"; // (only one import should remain)
// import algoliasearch from "algoliasearch/lite"; // Algolia removed for now
import { useAuth } from "../context/AuthContext";
import MediaTypeToggle from "./MediaTypeToggle";
import { MEDIA_TYPES } from "../constants/mediaTypes";
import { FadeInOverlay } from "./Dashboard";
import DetailedTaskView from "./DetailedTaskView";
import { FiCheckCircle } from "react-icons/fi";

// Algolia searchClient and index removed for now

import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { searchAlgoliaTasks } from "../utils/algoliaSearch";
import { FiSearch } from "react-icons/fi";

export default function CompletedTasksView() {
  const navigate = useNavigate();
  const { publicId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);

  const [users, setUsers] = useState([]);
  const [sortColumn, setSortColumn] = useState("completedDate");
  const [sortDirection, setSortDirection] = useState("desc");
  const [hasMore, setHasMore] = useState(true); // for infinite scroll
  const [lastDoc, setLastDoc] = useState(null); // firestore cursor
  const [page, setPage] = useState(0); // algolia page
  const [searchMode, setSearchMode] = useState(false); // are we searching?
  const [searchHasMore, setSearchHasMore] = useState(true); // for search infinite scroll
  const [searchLoading, setSearchLoading] = useState(false);
  const [emptyPageStreak, setEmptyPageStreak] = useState(0); // stop after consecutive empty client-filtered pages
  const searchInputRef = useRef(null);
  const observer = useRef();
  const { role, currentUser, userData, activeRole } = useAuth();
  const enabledMediaTypes = (userData?.permissions?.mediaTypes && Array.isArray(userData.permissions.mediaTypes))
    ? userData.permissions.mediaTypes
    : MEDIA_TYPES.map(t => t.key);
  const [selectedMediaTypes, setSelectedMediaTypes] = useState([]);
  // Initialize selected media types from user settings or default to all enabled
  useEffect(() => {
    if (userData?.permissions?.mediaTypes) {
      const shared = Array.isArray(userData.mediaTypeToggle) ? userData.mediaTypeToggle : null;
      if (shared && shared.length > 0) {
        setSelectedMediaTypes(shared.filter(type => enabledMediaTypes.includes(type)));
      } else {
        setSelectedMediaTypes([...enabledMediaTypes]);
      }
    } else if (enabledMediaTypes.length > 0 && selectedMediaTypes.length === 0) {
      setSelectedMediaTypes([...enabledMediaTypes]);
    }
  }, [userData]);

  // Helper: merge arrays of tasks uniquely by stable key
  const mergeUniqueTasks = React.useCallback((prev, next) => {
    const map = new Map();
    const put = (t) => {
      if (!t) return;
      const key = t.publicId ?? t.id ?? t.objectID;
      if (key == null) return;
      const k = String(key);
      if (!map.has(k)) map.set(k, t);
    };
    prev.forEach(put);
    next.forEach(put);
    return Array.from(map.values());
  }, []);

  // Debounced search query state
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Show loading message only if no results after 5 seconds
  const [showDelayedLoading, setShowDelayedLoading] = useState(false);

  // Helper to build Algolia filters string for stage + mediaType
  const buildAlgoliaFilters = React.useCallback(() => {
    // Only filter by stage on the server to keep results populated even if mediaType is not set as filterable in Algolia.
    return 'stage:"Completed"';
  }, []);

  // Initial load and debounced search (Algolia only)
  useEffect(() => {
    setTasksLoading(true);
    setPage(0);
    setSearchHasMore(true);
    setEmptyPageStreak(0);
    setShowDelayedLoading(false);
    let loadingTimeout = setTimeout(() => {
      setShowDelayedLoading(true);
    }, 5000);
    const doSearch = async () => {
      try {
        // Fetch from Algolia and filter for completed, selected media types, and not archived
        const res = await searchAlgoliaTasks({ query: debouncedQuery.trim(), page: 0, hitsPerPage: 25, filters: buildAlgoliaFilters() });
        const filteredHits = res.hits.filter(task => task.stage === "Completed" && task.archived !== true && (selectedMediaTypes.length === 0 || selectedMediaTypes.includes(task.mediaType)));
        setTasks(prev => mergeUniqueTasks([], filteredHits));
        setSearchHasMore(res.nbPages > 1);
      } catch {
        setTasks([]);
        setSearchHasMore(false);
      }
      setTasksLoading(false);
      clearTimeout(loadingTimeout);
      setShowDelayedLoading(false);
    };
    doSearch();
    return () => clearTimeout(loadingTimeout);
  }, [debouncedQuery, buildAlgoliaFilters]);

  // When media type selection changes, restart search state to avoid long pagination runs
  useEffect(() => {
    // Trigger a fresh fetch by bumping debouncedQuery dependency indirectly
    // We simply reset paging state; the main effect above will run because buildAlgoliaFilters is stable.
    setPage(0);
    setSearchHasMore(true);
    setEmptyPageStreak(0);
    // Optionally, clear tasks to reflect immediate filter change
    setTasks(prev => prev); // no-op; UI filters client-side immediately
  }, [selectedMediaTypes]);

  // Debounced and robust infinite scroll handler for Algolia
  const loadMoreAlgolia = (() => {
    let debounceTimer = null;
    let inFlight = false;
    return async () => {
      if (!searchHasMore || searchLoading || inFlight) return;
      inFlight = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const nextPage = page + 1;
          const res = await searchAlgoliaTasks({ query: searchQuery, page: nextPage, hitsPerPage: 20, filters: buildAlgoliaFilters() });
          const nextHits = Array.isArray(res.hits)
            ? res.hits.filter(task => task.stage === "Completed" && task.archived !== true && (selectedMediaTypes.length === 0 || selectedMediaTypes.includes(task.mediaType)))
            : [];
          setTasks(prev => mergeUniqueTasks(prev, nextHits));
          // If we didn't add anything new on this page, increment streak; stop after a few pages
          if (!nextHits || nextHits.length === 0) {
            setEmptyPageStreak(s => {
              const ns = s + 1;
              if (ns >= 3) setSearchHasMore(false);
              return ns;
            });
          } else {
            setEmptyPageStreak(0);
          }
          setPage(nextPage);
          setSearchHasMore((nextPage + 1) < res.nbPages);
        } catch {
          setSearchHasMore(false);
        }
        setSearchLoading(false);
        inFlight = false;
      }, 200); // Debounce delay
    };
  })();

  // IntersectionObserver for infinite scroll (always uses Algolia)
  const lastTaskRef = React.useCallback(node => {
    if (tasksLoading || searchLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new window.IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadMoreAlgolia();
      }
    });
    if (node) observer.current.observe(node);
  }, [tasksLoading, searchLoading, searchHasMore, page, searchQuery]);

  // Fetch users for displayName lookup
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const db = getFirestore();
        const q = collection(db, "users");
        const snap = await getDocs(q);
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch {
        setUsers([]);
      }
    };
    fetchUsers();
  }, []);

  // Sorting handler
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter and sort tasks client-side
  const filteredTasks = React.useMemo(() => {
    let filtered = tasks.filter(t => t.archived !== true);
    // Photographer view: only see tasks assigned to me
    if (activeRole === 'photographer' && currentUser) {
      const uid = currentUser.uid;
      filtered = filtered.filter(t => {
        const single = t.assignedPhotographer === uid;
        const multi = Array.isArray(t.assignedPhotographers) && (t.assignedPhotographers.includes(uid) || t.assignedPhotographers.some(x => (x && (x.uid === uid || x.id === uid || x === uid))));
        return single || multi;
      });
    }
    // Media type client-side filter as an extra guard
    if (selectedMediaTypes && selectedMediaTypes.length > 0) {
      filtered = filtered.filter(t => selectedMediaTypes.includes(t.mediaType));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(task => {
        const unitCode = (task.propertyName || '').toLowerCase();
        const prettyName = task.prettyPropertyName?.toLowerCase?.() || '';
        const propertyType = (task.propertyType || '').toLowerCase();
        const updateType = (task.updateType || '').toLowerCase();
        const id = (task.id || '').toLowerCase();
        const completedDateRaw = task.lastProgressUpdate || task.stageUpdated || task.completedAt || task.updatedAt || task.createdAt || null;
        let completedDateStr = "";
        if (completedDateRaw) {
          const date = new Date(completedDateRaw);
          if (!isNaN(date)) {
            completedDateStr = date.toLocaleString().toLowerCase();
          }
        }
        return [unitCode, prettyName, propertyType, updateType, id, completedDateStr]
          .some(val => val && val.includes(q));
      });
    }
    // Sort
    filtered = filtered.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];
      if (valA == null) valA = "";
      if (valB == null) valB = "";
      if (sortColumn === "propertyName" || sortColumn === "updateType" || sortColumn === "assignedEditorDisplayName") {
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }
      if (sortColumn === "completedDate") {
        const coalesce = (t) => t?.completedDate || t?.lastProgressUpdate || t?.stageUpdated || t?.completedAt || t?.updatedAt || t?.createdAt || null;
        const dateA = new Date(coalesce(a));
        const dateB = new Date(coalesce(b));
        const validA = dateA instanceof Date && !isNaN(dateA);
        const validB = dateB instanceof Date && !isNaN(dateB);
        if (!validA && !validB) return 0;
        if (!validA) return sortDirection === "asc" ? 1 : -1;
        if (!validB) return sortDirection === "asc" ? -1 : 1;
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      }
      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [tasks, searchQuery, sortColumn, sortDirection, selectedMediaTypes]);

  const visibleColumns = ["mediaType", "propertyName", "updateType", "completedDate"];

  // Sync selectedTask with URL param for deep linking, fetch from Algolia if not present
  useEffect(() => {
    async function ensureTaskForModal() {
      if (publicId) {
        let found = tasks.find(t => String(t.publicId ?? t.id ?? t.objectID) === String(publicId));
        if (!found) {
          try {
            const res = await searchAlgoliaTasks({
              query: "",
              hitsPerPage: 1,
              filters: `stage=Completed AND publicId=${parseInt(publicId, 10)}`
            });
            console.log('Algolia modal fetch hits:', res.hits);
            found = res.hits.find(
              t => String(t.publicId ?? t.id ?? t.objectID) === String(publicId)
            );
            if (found) {
              setTasks(prev => mergeUniqueTasks([found], prev));
              setSelectedTask(found);
            } else {
              setSelectedTask(null);
            }
          } catch (err) {
            console.error('Error fetching from Algolia for publicId', publicId, err);
            setSelectedTask(null);
          }
        } else {
          setSelectedTask(found);
        }
      } else {
        setSelectedTask(null);
      }
    }
    ensureTaskForModal();
  }, [publicId, tasks]);
  
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--page-header)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
        <h2 style={{ fontWeight: 700, fontSize: 28, marginTop: 20, marginLeft: 40, marginRight: 20, fontFamily: "var(--title-font)", letterSpacing: 0.1}}><FiCheckCircle size={24} style={{ marginRight: 12, color: '#008000' }} />Completed Tasks</h2>
        {enabledMediaTypes.length > 1 && (
          <div style={{ marginRight: 16 }}>
            <MediaTypeToggle
              enabledMediaTypes={enabledMediaTypes}
              selectedMediaTypes={selectedMediaTypes}
              onChange={setSelectedMediaTypes}
              persistKey="mediaTypeToggle"
            />
          </div>
        )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search completed tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: searchOpen ? 240 : 0,
              opacity: searchOpen ? 1 : 0,
              marginRight: searchOpen ? 12 : 0,
              transition: 'width 0.35s cubic-bezier(.4,0,.2,1), opacity 0.23s cubic-bezier(.4,0,.2,1), margin 0.2s',
              padding: searchOpen ? '8px 14px' : '8px 0px',
              borderRadius: 8,
              border: '1.5px solid var(--sidebar-border)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: 16,
              outline: 'none',
              boxShadow: searchOpen ? '0 2px 8px rgba(80,120,200,0.07)' : 'none',
              pointerEvents: searchOpen ? 'auto' : 'none',
              minWidth: 0,
              maxWidth: 320,
            }}
            onBlur={() => { if (searchQuery === "") setSearchOpen(false); }}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(""); } }}
          />
          <button
            title={searchOpen ? "Close Search" : "Search Completed Tasks"}
            style={{
              background: 'var(--bg-card)',
              border: '1.5px solid #ddd',
              color: 'var(--text-main)',
              borderRadius: 10,
              borderColor: 'var(--sidebar-border)',
              padding: 8,
              marginRight: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(80,120,200,0.05)',
              transition: 'background 0.15s, border 0.15s'
            }}
            onClick={() => {
              setSearchOpen(o => {
                if (!o) setTimeout(() => searchInputRef.current && searchInputRef.current.focus(), 80);
                else if (searchQuery !== "") setSearchQuery("");
                return !o;
              });
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'var(--sidebar-bg)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'var(--bg-card)';
            }}
          >
            <FiSearch size={22} />
          </button>
        </div>
      </div>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, boxShadow: "0 2px 16px rgba(80,120,200,0.07)", padding: 0, minHeight: 360, width: "100%", minWidth: 800 }}>
        {showDelayedLoading ? (
          <div style={{ textAlign: "center", padding: 48, fontSize: 18 }}>Loading completed tasks...</div>
        ) : (
          <TaskTable
            tasks={filteredTasks}
            visibleColumns={visibleColumns}
            onRowClick={task => navigate(`/completed-tasks/${task.publicId}`)}
            users={users}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            customHeaders={{ completedDate: "Completed Date" }}
            customCellRenderers={{
              completedDate: (task) => {
                const coalesce = (t) => t?.completedDate || t?.lastProgressUpdate || t?.stageUpdated || t?.completedAt || t?.updatedAt || t?.createdAt || null;
                const raw = coalesce(task);
                if (!raw) return "-";
                const date = new Date(raw);
                return (date instanceof Date && !isNaN(date)) ? date.toLocaleString() : "-";
              },
            }}
            rowProps={(task, idx) => ({
              ref: idx === filteredTasks.length - 1 && filteredTasks.length > 0 ? lastTaskRef : undefined
            })}
            enableRowProps={true}
          />
        )}
        {(tasksLoading || searchLoading) && (
          <div style={{ textAlign: "center", padding: 24, fontSize: 16 }}>
            Loading more tasks...
          </div>
        )}
      </div>
      {publicId && (
        <FadeInOverlay sidebarWidth={68} onClose={() => navigate('/completed-tasks')}>
          {(handleFadeOut) => (
            <div style={{ marginTop: 20, width: "100%", maxWidth: 1200 }}>
              <DetailedTaskView
                usePublicId={true}
                role={activeRole}
                currentUser={currentUser}
                users={users}
                onAddFiles={() => {}}
                onCloseTask={() => navigate('/completed-tasks')}
                onReassign={() => {}}
                onReportIssue={() => {}}
              />
            </div>
          )}
        </FadeInOverlay>
      )}
    </div>
  );
}


