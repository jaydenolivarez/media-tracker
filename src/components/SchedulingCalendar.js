import React, { useMemo, useState, useEffect, useRef } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import TimeGrid from "react-big-calendar/lib/TimeGrid";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth
} from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { getMediaTypeColor } from "../constants/mediaTypes";
import { FiAlertTriangle, FiChevronRight } from "react-icons/fi";
import { parseRangeAvailability } from "../utils/icalAvailability";
import { fetchWeeklyWeather } from "../utils/weather";
import { WiDaySunny, WiCloudy, WiDayCloudy, WiRain, WiThunderstorm, WiSnow, WiFog } from "react-icons/wi";

const locales = {};

// Map short forecast text to a weather icon
function getWeatherIcon(shortForecast) {
  const forecast = (shortForecast || '').toLowerCase();
  if (forecast.includes('sunny') || forecast.includes('clear')) return <WiDaySunny size={24} color="#f7c948" title={shortForecast} />;
  if (forecast.includes('partly cloudy') || forecast.includes('mostly sunny')) return <WiDayCloudy size={24} color="#c7d0e0" title={shortForecast} />;
  if (forecast.includes('cloudy') || forecast.includes('overcast')) return <WiCloudy size={24} color="#a0aec0" title={shortForecast} />;
  if (forecast.includes('thunderstorm')) return <WiThunderstorm size={24} color="#6b7280" title={shortForecast} />;
  if (forecast.includes('rain') || forecast.includes('showers') || forecast.includes('drizzle')) return <WiRain size={24} color="#4f8ef7" title={shortForecast} />;
  if (forecast.includes('snow') || forecast.includes('flurries') || forecast.includes('sleet')) return <WiSnow size={24} color="#b9e0f7" title={shortForecast} />;
  if (forecast.includes('fog') || forecast.includes('mist') || forecast.includes('haze')) return <WiFog size={24} color="#bfc9d1" title={shortForecast} />;
  return <WiDaySunny size={24} color="#f7c948" title={shortForecast || 'Weather'} />;
}
const localizer = dateFnsLocalizer({
  format,
  parse,
  // Ensure weeks start on Sunday and respect the provided date
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales
});

// Custom 7-day rolling Week view built on TimeGrid
function SevenDayWeek(props) {
  return (
    <TimeGrid
      {...props}
      range={SevenDayWeek.range(props.date)}
      showAllDay={false}
      eventOffset={15}
    />
  );
}
SevenDayWeek.range = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
};
SevenDayWeek.navigate = (date, action) => {
  switch (action) {
    case 'PREV':
      return addDays(date, -7);
    case 'NEXT':
      return addDays(date, 7);
    default:
      return date;
  }
};
SevenDayWeek.title = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 6);
  const sameMonth = format(start, 'MMM') === format(end, 'MMM');
  return sameMonth
    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
};

const EventContent = ({ event, onAssign }) => {
  const { task } = event;
  const mediaColor = getMediaTypeColor(task?.mediaType);
  return (
    <div
      className="sched-cal-event"
      title={`${task?.propertyName || "Untitled"}\n${task?.updateType || ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 600,
        position: "relative"
      }}
    >
      <span
        className="sched-cal-dot"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background: mediaColor
        }}
      />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {task?.propertyName || "Untitled"}
      </span>
      {task?.priorityRequest === true && (
        <FiAlertTriangle style={{ marginLeft: 6, color: "#ef4444" }} title="Priority" />
      )}
      {typeof onAssign === "function" && (
        <button
          className="sched-cal-assign"
          onClick={(e) => {
            e.stopPropagation();
            onAssign(task?.id, { start: event.start, end: event.end });
          }}
          style={{
            marginLeft: 6,
            background: "rgba(59,130,246,0.12)",
            color: "#1d4ed8",
            border: "1px solid rgba(59,130,246,0.24)",
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: 12,
            fontWeight: 700,
            display: "none"
          }}
        >
          Assign this range
        </button>
      )}
      <style>{`
        .rbc-event:hover .sched-cal-assign { display: inline-block; }
      `}</style>
    </div>
  );
};

const SchedulingCalendar = ({
  tasks = [],
  selectedTaskId,
  onEventClick,
  onAssign,
  defaultDate
}) => {
  const [currentDate, setCurrentDate] = useState(defaultDate || new Date());
  // Rolling 7-day window starting from the currentDate
  const weekStart = useMemo(() => currentDate, [currentDate]);
  const weekEnd = useMemo(() => addDays(currentDate, 6), [currentDate]);
  const [events, setEvents] = useState([]);
  const [tasksWithoutIcal, setTasksWithoutIcal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [weatherByWeekday, setWeatherByWeekday] = useState({});
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const calendarViews = useMemo(() => ({ week: SevenDayWeek, month: true }), []);
  // Month view: map of yyyy-MM-dd -> array of events covering that day
  const [monthDayMap, setMonthDayMap] = useState({});
  // Month view popup: show list of tasks for a given date at a position
  const [monthPopup, setMonthPopup] = useState(null); // { key, x, y }
  // Minimum column width and canvas min-width for horizontal scroll
  const MIN_DAY_COL_WIDTH = 160;
  const canvasMinWidth = useMemo(() => 7 * MIN_DAY_COL_WIDTH, [viewMode]);
  // Custom aligned lanes for week view
  const [laneItems, setLaneItems] = useState([]); // [{task, date, dayIdx, lane}]
  const [laneCount, setLaneCount] = useState(0);
  // Ref points to the inner canvas (the element that has minWidth and contains RBC + overlays)
  const containerRef = useRef(null);
  const [overlayOffsets, setOverlayOffsets] = useState({ left: 0, right: 0, headerHeight: 60 });
  // Track whether this is the first render and what range is visible to avoid showing the spinner on mere task updates
  const firstLoadRef = useRef(true);
  const lastRangeKeyRef = useRef('');

  // Build events from iCal availability using the same logic as WeeklyAvailabilityView
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Only show spinner on initial mount or when the visible date range changes
        const rangeKey = viewMode === 'week'
          ? `w:${format(weekStart, 'yyyy-MM-dd')}:${format(weekEnd, 'yyyy-MM-dd')}`
          : `m:${format(startOfMonth(currentDate), 'yyyy-MM-dd')}`;
        const shouldShowSpinner = firstLoadRef.current || lastRangeKeyRef.current !== rangeKey;
        if (shouldShowSpinner) setLoading(true);
        let result;
        if (viewMode === 'week') {
          // Compute availability from raw iCal for the visible rolling 7-day window
          result = await parseRangeAvailability(Array.isArray(tasks) ? tasks : [], weekStart, weekEnd, weekStart);
        } else {
          const mStart = startOfMonth(currentDate);
          const mEnd = endOfMonth(currentDate);
          // Exclude past days relative to today, not the visible week's start
          result = await parseRangeAvailability(Array.isArray(tasks) ? tasks : [], mStart, mEnd, new Date());
        }
        if (cancelled || !result || !Array.isArray(result.days)) return;
        const evts = [];

        if (viewMode === 'week') {
          // Week view: create a one-day event per available day (kept for month parity/logic reuse),
          // but we will HIDE these RBC events and render our own aligned overlay.
          const laneMap = new Map(); // taskId -> lane index
          let nextLane = 0;
          const items = [];
          for (let i = 0; i < result.days.length; i++) {
            const day = result.days[i];
            if (!Array.isArray(day.tasks)) continue;
            for (const { task } of day.tasks) {
              // Assign lane for the task
              if (!laneMap.has(task.id)) {
                laneMap.set(task.id, nextLane++);
              }
              const lane = laneMap.get(task.id);
              const startDate = new Date(day.date + "T00:00:00");
              const endDateExclusive = addDays(startDate, 1);
              // still push an RBC event (hidden by CSS) to preserve semantics if needed
              evts.push({
                id: `${task.id}-${day.date}`,
                title: task.propertyName || "Untitled",
                start: startDate,
                end: endDateExclusive,
                allDay: true,
                task,
              });
              items.push({ task, date: day.date, dayIdx: i, lane });
            }
          }
          setLaneItems(items);
          setLaneCount(nextLane);
        } else {
          // Month view (or others): group contiguous runs into single spans
          const presence = new Map(); // taskId -> { task, present: boolean[N] }
          const N = result.days.length;
          for (let i = 0; i < N; i++) {
            const day = result.days[i];
            if (!Array.isArray(day.tasks)) continue;
            for (const { task } of day.tasks) {
              let rec = presence.get(task.id);
              if (!rec) {
                rec = { task, present: Array(N).fill(false) };
                presence.set(task.id, rec);
              }
              rec.present[i] = true;
            }
          }
          for (const rec of presence.values()) {
            const { task, present } = rec;
            let i = 0;
            while (i < present.length) {
              if (!present[i]) { i++; continue; }
              const runStartIdx = i;
              while (i < present.length && present[i]) i++;
              const runEndIdx = i - 1;
              const startDate = new Date(result.days[runStartIdx].date + "T00:00:00");
              const endDateExclusive = addDays(new Date(result.days[runEndIdx].date + "T00:00:00"), 1);
              evts.push({
                id: `${task.id}-${result.days[runStartIdx].date}-${result.days[runEndIdx].date}`,
                title: task.propertyName || "Untitled",
                start: startDate,
                end: endDateExclusive,
                allDay: true,
                task,
              });
            }
          }
        }
        setEvents(evts);
        setTasksWithoutIcal(Array.isArray(result.tasksWithoutIcal) ? result.tasksWithoutIcal : []);
      } finally {
        if (!cancelled) {
          // Update range tracking and hide spinner if it was shown
          const newRangeKey = viewMode === 'week'
            ? `w:${format(weekStart, 'yyyy-MM-dd')}:${format(weekEnd, 'yyyy-MM-dd')}`
            : `m:${format(startOfMonth(currentDate), 'yyyy-MM-dd')}`;
          lastRangeKeyRef.current = newRangeKey;
          firstLoadRef.current = false;
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tasks, weekStart, weekEnd, viewMode]);

  // Build per-day map for month view counts from span events
  useEffect(() => {
    if (viewMode !== 'month') { setMonthDayMap({}); return; }
    try {
      const map = {};
      const mStart = startOfMonth(currentDate);
      const mEnd = endOfMonth(currentDate);
      const monthEvents = Array.isArray(events) ? events : [];
      for (const ev of monthEvents) {
        try {
          let d = new Date(ev.start);
          const endExcl = new Date(ev.end);
          // Clamp to current visible month range just in case
          if (d < mStart) d = new Date(mStart);
          while (d < endExcl && d <= mEnd) {
            const key = format(d, 'yyyy-MM-dd');
            if (!map[key]) map[key] = [];
            map[key].push(ev);
            d = addDays(d, 1);
          }
        } catch {}
      }
      setMonthDayMap(map);
    } catch {
      setMonthDayMap({});
    }
  }, [viewMode, events, currentDate]);

  // Fetch weekly weather and map by local date (yyyy-MM-dd) for daytime periods + weekday name fallback
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const periods = await fetchWeeklyWeather();
        if (!mounted || !Array.isArray(periods)) return;
        const map = {};
        periods.forEach(p => {
          try {
            if (p && p.isDaytime && p.startTime) {
              const key = format(new Date(p.startTime), 'yyyy-MM-dd');
              if (key) map[key] = p;
              const nameKey = (p.name || '').toLowerCase();
              if (nameKey) map[nameKey] = p;
            }
          } catch {}
        });
        setWeatherByWeekday(map);
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, [weekStart]);

  // Navigation helpers for custom toolbar
  const goPrev = () => {
    if (viewMode === 'week') {
      const candidate = addDays(weekStart, -7);
      const cand0 = new Date(candidate); cand0.setHours(0, 0, 0, 0);
      const today0 = new Date(); today0.setHours(0, 0, 0, 0);
      setCurrentDate(cand0 < today0 ? today0 : candidate);
    } else {
      const candidate = addMonths(currentDate, -1);
      const today0 = new Date(); today0.setHours(0, 0, 0, 0);
      const candYm = candidate.getFullYear() * 12 + candidate.getMonth();
      const todayYm = today0.getFullYear() * 12 + today0.getMonth();
      setCurrentDate(candYm < todayYm ? today0 : candidate);
    }
  };
  const goNext = () => setCurrentDate(viewMode === 'week' ? addDays(weekStart, 7) : addMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Measure RBC all-day row to align overlay columns and header height
  useEffect(() => {
    if (viewMode !== 'week') return;
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const headerRow = container.querySelector('.rbc-time-header-content > .rbc-row:first-child');
      if (headerRow) {
        const cRect = container.getBoundingClientRect();
        const hRect = headerRow.getBoundingClientRect();
        setOverlayOffsets({
          left: Math.max(0, hRect.left - cRect.left),
          right: Math.max(0, cRect.right - hRect.right),
          headerHeight: hRect.height
        });
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [viewMode, currentDate]);

  // Disable Prev when at the first allowed period
  // Week: first 7-day window (today .. today+6)
  // Month: current month (cannot go to months before the current month)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStartStart = new Date(weekStart); weekStartStart.setHours(0, 0, 0, 0);
  const isWeekPrevDisabled = weekStartStart.getTime() <= todayStart.getTime();
  const currentYm = currentDate.getFullYear() * 12 + currentDate.getMonth();
  const todayYm = todayStart.getFullYear() * 12 + todayStart.getMonth();
  const isMonthPrevDisabled = currentYm <= todayYm;
  const isPrevDisabled = (viewMode === 'week' && isWeekPrevDisabled) || (viewMode === 'month' && isMonthPrevDisabled);

  const formatWeekTitle = (start, end) => {
    const sameMonth = format(start, 'MMM') === format(end, 'MMM');
    if (sameMonth) return `${format(start, 'MMM d')} – ${format(end, 'd')}`;
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  };

  return (
    <div style={{ width: "100%", height: '89vh', position: "relative", display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Custom top header: week title + controls */}
      <div className="calendar-top-header" style={{
        background: 'var(--calendar-header-bg, #f1f5fb)',
        border: '1px solid var(--table-border, #2d313e10)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 5
      }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          {viewMode === 'week' ? formatWeekTitle(weekStart, weekEnd) : format(currentDate, 'MMMM yyyy')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #d2d6e1', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
            <button onClick={() => setViewMode('week')} style={{ padding: '6px 10px', border: 'none', background: viewMode==='week' ? '#eef1f7' : 'transparent', fontWeight: 600, cursor: 'pointer' }}>Week</button>
            <button onClick={() => setViewMode('month')} style={{ padding: '6px 10px', border: 'none', background: viewMode==='month' ? '#eef1f7' : 'transparent', fontWeight: 600, cursor: 'pointer' }}>Month</button>
          </div>
          <button onClick={goPrev} disabled={isPrevDisabled} className="btn btn-light" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d2d6e1', background: '#fff', cursor: isPrevDisabled ? 'not-allowed' : 'pointer', opacity: isPrevDisabled ? 0.5 : 1 }}>Prev</button>
          <button onClick={goToToday} className="btn btn-light" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d2d6e1', background: '#fff', cursor: 'pointer' }}>Today</button>
          <button onClick={goNext} className="btn btn-light" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d2d6e1', background: '#fff', cursor: 'pointer' }}>Next</button>
        </div>
      </div>

      {/* Main calendar container (no page-level horizontal scroll) */}
      <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative", overflow: 'hidden' }}>
        {/* Canvas: calendar and overlays; width tracks the viewport */}
        <div ref={containerRef} style={{ position: 'relative', height: '100%', width: '100%' }}>
        {/* Make a dates-only week view: hide time grid, stretch all-day to full height */}
        <style>{`
          /* Hide gutters and the time grid entirely */
          .rbc-time-header-gutter,
          .rbc-time-gutter,
          .rbc-time-content { display: none !important; }

          /* Stretch the header (which contains the all-day row) to full height */
          .rbc-time-view { overflow: hidden; display: flex; flex-direction: column; }
          .rbc-time-header { flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; border-bottom: none !important; pointer-events: none !important; }
          .rbc-time-header-content { flex: 1 1 auto; display: flex; flex-direction: column; }
          .rbc-time-header-content > .rbc-row:first-child { flex: 0 0 auto; min-height: 60px; background: var(--calendar-header-bg, #f1f5fb); position: relative; z-index: 20; pointer-events: none; }
          /* Remove the second header row entirely to prevent empty rows and click interception */
          .rbc-time-header-content > .rbc-row:last-child { display: none !important; height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-cell { height: 0 !important; min-height: 0 !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-cell .rbc-row-bg { height: 0 !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-events { height: 0 !important; min-height: 0 !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-content { height: 0 !important; min-height: 0 !important; }
          /* Ensure the all-day row background remains measurable horizontally but not interactive */
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-bg { position: relative; z-index: 0; pointer-events: none !important; }

          /* Day header typography (no borders) */
          .rbc-time-view .rbc-header { font-weight: 800; font-size: 18px; padding: 10px 8px; border: none !important; background: var(--calendar-header-bg, #f1f5fb); box-shadow: none !important; }
          .rbc-time-header-content > .rbc-row > .rbc-header { border: none !important; }

          /* Ensure RBC all-day EventRow does not capture clicks or overlay pills */
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-events { pointer-events: none !important; position: relative; z-index: 0; background: transparent !important; padding: 0 !important; margin: 0 !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-row { pointer-events: none !important; background: transparent !important; box-shadow: none !important; border: none !important; position: relative; z-index: 0; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-segment { pointer-events: none !important; background: transparent !important; box-shadow: none !important; border: none !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-event { display: none !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-events .rbc-row { display: none !important; }

          /* Remove any residual spacing on the collapsed all-day row */
          .rbc-time-header-content > .rbc-row:last-child,
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-cell,
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-content {
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            line-height: 0 !important;
          }
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-content { height: 0 !important; min-height: 0 !important; overflow: hidden !important; }
          .rbc-time-header-content > .rbc-row:last-child * { pointer-events: none !important; }
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-content .rbc-row { display: none !important; }

          /* Collapse the visual height of RBC all-day events area so no empty rows remain */
          .rbc-time-header-content > .rbc-row:last-child .rbc-allday-events,
          .rbc-time-header-content > .rbc-row:last-child .rbc-row,
          .rbc-time-header-content > .rbc-row:last-child .rbc-row-segment {
            height: 0 !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
          }

          /* Remove RBC alternating shaded backgrounds in week header; overlay supplies stripes */
          .rbc-time-header-content .rbc-row-bg .rbc-day-bg { position: relative; background: transparent !important; border: none !important; }
          .rbc-time-header-content .rbc-row-bg .rbc-day-bg::after { content: none !important; display: none !important; }
          .rbc-allday-events { background: transparent !important; }
          /* In week view we will render our own aligned overlay; hide default RBC all-day events */
          .rbc-time-view .rbc-allday-events .rbc-event { display: ${viewMode === 'week' ? 'none' : 'block'} !important; }

          /* Month view: remove borders and add alternating backgrounds per column */
          .rbc-month-view, .rbc-month-header, .rbc-month-row, .rbc-month-row + .rbc-month-row, .rbc-day-bg, .rbc-date-cell, .rbc-header { border: none !important; }
          .rbc-month-row .rbc-background-row .rbc-day-bg { position: relative; background: transparent; }
          .rbc-month-row .rbc-background-row .rbc-day-bg:nth-child(even)::after { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,0.03); pointer-events: none; }

          /* Month view: make each date cell a positioning context for centered badges */
          .rbc-month-view .rbc-date-cell { position: relative; }

          /* Month view: hide RBC event pills and 'show more' links; we will render a count badge instead */
          .rbc-month-view .rbc-event { display: none !important; }
          .rbc-month-view .rbc-show-more { display: none !important; }

          /* Remove residual borders from RBC containers */
          .rbc-time-view, .rbc-time-header, .rbc-time-content, .rbc-allday-cell, .rbc-row, .rbc-row-segment, .rbc-day-slot, .rbc-timeslot-group {
            border: none !important;
          }

          /* Simple spinner */
          @keyframes sched-spin { to { transform: rotate(360deg); } }
          .sched-spinner { width: 32px; height: 32px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #2563eb; border-radius: 999px; animation: sched-spin 1s linear infinite; }
        `}</style>
        <Calendar
          localizer={localizer}
          toolbar={false}
          events={viewMode === 'week' ? [] : events}
          startAccessor="start"
          endAccessor="end"
          views={calendarViews}
          view={viewMode}
          date={currentDate}
          popup
          onNavigate={(date) => setCurrentDate(date)}
          onSelectEvent={(e) => {
            if (typeof onEventClick === "function") onEventClick(e?.task?.id);
          }}
          components={{
            week: {
              header: ({ date }) => {
                const key = format(date, 'yyyy-MM-dd');
                const wx = weatherByWeekday[key] || weatherByWeekday[format(date, 'EEEE').toLowerCase()];
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{format(date, 'EEE d')}</span>
                    {wx && <span title={wx.shortForecast}>{getWeatherIcon(wx.shortForecast)}</span>}
                  </div>
                );
              }
            },
            month: {
              header: ({ date }) => {
                const wx = weatherByWeekday[format(date, 'EEEE').toLowerCase()];
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 800 }}>{format(date, 'EEE')}</span>
                    {wx && <span title={wx.shortForecast}>{getWeatherIcon(wx.shortForecast)}</span>}
                  </div>
                );
              },
              dateHeader: ({ label, date }) => {
                const key = format(date, 'yyyy-MM-dd');
                const count = (monthDayMap[key] || []).length;
                return (
                  <div style={{ position: 'relative', padding: '2px 4px' }}>
                    <span style={{ fontWeight: 800 }}>{format(date, 'd')}</span>
                    {count > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = containerRef.current?.getBoundingClientRect();
                          const x = rect ? (e.clientX - rect.left) : 20;
                          const y = rect ? (e.clientY - rect.top) : 20;
                          setMonthPopup({ key, x, y });
                        }}
                        style={{
                          position: 'absolute',
                          top: '120%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          zIndex: 2,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 50,
                          height: 50,
                          minWidth: 40,
                          borderRadius: 999,
                          border: 'none',
                          background: '#1d4ed8',
                          color: '#ffffff',
                          fontWeight: 900,
                          fontSize: 20,
                          boxShadow: '0 6px 12px rgba(29, 78, 216, 0.25)',
                          cursor: 'pointer'
                        }}
                        title={`${count} task${count !== 1 ? 's' : ''}`}
                        aria-label={`${count} task${count !== 1 ? 's' : ''} on ${format(date, 'PPP')}`}
                      >
                        {count}
                      </button>
                    )}
                  </div>
                );
              }
            },
            event: (props) => (
              <EventContent {...props} onAssign={(id, range) => {
                if (typeof onAssign === "function") {
                  // Convert RBC exclusive end back to inclusive date
                  onAssign(id, { start: props.event.start, end: addDays(props.event.end, -1) });
                }
              }} />
            )
          }}
          eventPropGetter={(event) => {
            const mediaColor = getMediaTypeColor(event?.task?.mediaType);
            const isSelected = selectedTaskId && event?.task?.id === selectedTaskId;
            return {
              style: {
                background: mediaColor,
                border: isSelected ? `2px solid #4f46e5` : `0px solid ${mediaColor}`,
                color: '#fff',
                borderRadius: 10,
                padding: isSelected ? 1 : 2,
                boxShadow: isSelected ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(0,0,0,0.15)'
              },
              className: isSelected ? 'rbc-event-selected' : undefined
            };
          }}
          dayPropGetter={() => ({ style: { background: "var(--bg-main)" } })}
          defaultDate={defaultDate || new Date()}
          formats={{
            dayFormat: (date, culture, loc) => loc.format(date, "EEE d"),
          }}
        />
        {/* Loading overlay: covers the content area while preserving full layout */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: overlayOffsets.headerHeight + 1,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-main)',
              zIndex: 2,
            }}
          >
            <div className="sched-spinner" aria-label="Loading calendar" />
          </div>
        )}
        {/* Month view: custom popup to list tasks for a clicked day */}
        {viewMode === 'month' && monthPopup && (
          <div
            style={{
              position: 'absolute',
              left: Math.max(8, Math.min(monthPopup.x, (containerRef.current?.clientWidth || 400) - 260)),
              top: Math.max(overlayOffsets.headerHeight + 8, Math.min(monthPopup.y, (containerRef.current?.clientHeight || 400) - 220)),
              width: 240,
              maxHeight: 200,
              overflowY: 'auto',
              background: '#fff',
              border: '1px solid var(--border-muted)',
              borderRadius: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
              zIndex: 9999,
              padding: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>{format(new Date(monthPopup.key), 'EEE, MMM d')}</strong>
              <button onClick={() => setMonthPopup(null)} aria-label="Close" title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(monthDayMap[monthPopup.key] || []).map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => { setMonthPopup(null); if (typeof onEventClick === 'function') onEventClick(ev.task?.id); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: 'var(--chip-bg, #f7f9fc)', border: '1px solid var(--border-muted)' }}
                  title={ev.task?.propertyName || 'Untitled'}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: getMediaTypeColor(ev.task?.mediaType), flex: '0 0 auto' }} />
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.task?.propertyName || 'Untitled'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Custom aligned overlay for week view */}
        {viewMode === 'week' && (
          <div
            className="custom-allday-overlay"
            style={{
              position: 'absolute',
              left: overlayOffsets.left,
              right: overlayOffsets.right,
              top: overlayOffsets.headerHeight + 1,
              bottom: 0,
              boxSizing: 'border-box',
              padding: '8px 0px',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <div
              className="overlay-scroll"
              style={{
                position: 'relative',
                height: '100%',
                width: '100%',
                overflowY: 'auto',
                overflowX: 'auto',
                pointerEvents: 'auto',
              }}
            >
              <div
                className="overlay-content"
                style={{
                  position: 'relative',
                  width: '100%',
                  minWidth: viewMode === 'week' ? canvasMinWidth : undefined,
                  minHeight: loading ? '100%' : laneCount * 32 + Math.max(0, laneCount - 1) * 6,
                }}
              >
                {/* Background columns tied to content height */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                >
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={`bg-${i}`}
                      style={{
                        borderRight: i < 6 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                        background: i % 2 === 1 ? 'rgba(2, 6, 23, 0.04)' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                {/* Pills grid */}
                <div
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gridAutoRows: '32px',
                    gap: 6,
                    alignContent: 'start',
                    padding: '0 0 8px 0',
                    zIndex: 1,
                  }}
                >
                  {laneItems.map((it) => {
                    const mediaColor = getMediaTypeColor(it.task?.mediaType);
                    const isSelected = selectedTaskId && it.task?.id === selectedTaskId;
                    return (
                      <div
                        key={`${it.task.id}-${it.date}`}
                        style={{
                          gridColumn: `${it.dayIdx + 1} / span 1`,
                          gridRow: `${it.lane + 1} / span 1`,
                          alignSelf: 'stretch',
                          justifySelf: 'stretch',
                          minWidth: 0,
                          pointerEvents: 'auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 10,
                          background: mediaColor,
                          color: '#fff',
                          boxShadow: isSelected ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(0,0,0,0.15)',
                          border: isSelected ? '2px solid #4f46e5' : '0px solid transparent',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof onEventClick === 'function') onEventClick(it.task.id);
                        }}
                        title={`${it.task?.propertyName || 'Untitled'}\n${it.task?.updateType || ''}`}
                      >
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#fff', opacity: 0.9
                        }} />
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
                          {it.task?.propertyName || 'Untitled'}
                        </span>
                        {it.task?.priorityRequest === true && (
                          <FiAlertTriangle style={{ marginLeft: 6, color: '#fff' }} title="Priority" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      {/* Tasks without calendar */}
      {Array.isArray(tasksWithoutIcal) && tasksWithoutIcal.length > 0 && (
        <div style={{ marginTop: 16, position: 'relative', zIndex: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-main)', marginBottom: '10px', marginLeft: '10px' }}>
            {`Tasks without Calendar (${tasksWithoutIcal.length})`}
          </div>
          {/* Section styles */}
          <style>{`
            .no-ical-card { background: var(--bg-card); border: 1px solid var(--border-muted); padding: 12px; box-shadow: 0 2px 2px rgba(0,0,0,0.01); border-radius: 10px; }
            .no-ical-list { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
            .no-ical-item { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--chip-bg, #f7f9fc); color: var(--text-main); border: 1px solid var(--border-muted); cursor: pointer; user-select: none; transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease; max-width: 100%; }
            .no-ical-item:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); background: var(--chip-bg-hover, #f1f5fb); }
            .no-ical-item:active { transform: translateY(0); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
            .no-ical-item:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
            .no-ical-dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; flex: 0 0 auto; }
            .no-ical-text { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
            .no-ical-chev { color: var(--text-muted, #64748b); display: inline-flex; align-items: center; }
          `}</style>
          <div className="no-ical-card">
            <div className="no-ical-list">
              {tasksWithoutIcal.map(t => (
                <div
                  key={t.id}
                  className="no-ical-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (typeof onEventClick === 'function') onEventClick(t.id); }}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && typeof onEventClick === 'function') { e.preventDefault(); onEventClick(t.id); } }}
                  title={t.propertyName}
                >
                  <span className="no-ical-dot" style={{ background: getMediaTypeColor(t.mediaType) }} />
                  <span className="no-ical-text">{t.propertyName || 'Untitled'}</span>
                  <span className="no-ical-chev" aria-hidden>
                    <FiChevronRight size={14} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingCalendar;
