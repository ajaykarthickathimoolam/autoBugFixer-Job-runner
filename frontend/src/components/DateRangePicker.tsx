import { useEffect, useRef, useState } from 'react';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDisplay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function CalendarMonth({
  year,
  month,
  from,
  to,
  onNavigate,
  onSelectDay,
}: {
  year: number;
  month: number;
  from: string;
  to: string;
  onNavigate: (delta: number) => void;
  onSelectDay: (iso: string) => void;
}) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
              type="button"
              onClick={() => onNavigate(-1)}
              className="rounded px-2 py-1 text-sm text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-[color:var(--color-text-100)]">
            {MONTH_LABELS[month]} {year}
          </span>
          <button
              type="button"
              onClick={() => onNavigate(1)}
              className="rounded px-2 py-1 text-sm text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((w, i) => (
              <span key={i} className="text-center text-xs text-[color:var(--color-text-600)]">
              {w}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const iso = toIso(year, month, day);
            const isEndpoint = iso === from || iso === to;
            const inRange = from && to && iso > from && iso < to;
            return (
                <button
                    key={i}
                    type="button"
                    onClick={() => onSelectDay(iso)}
                    className={`h-7 w-7 rounded-full text-xs transition-colors ${
                        isEndpoint
                            ? 'bg-[color:var(--color-accent-primary)] font-semibold text-[color:var(--color-on-accent)]'
                            : inRange
                                ? 'bg-[color:var(--color-accent-primary)]/15 text-[color:var(--color-text-100)]'
                                : 'text-[color:var(--color-text-100)] hover:bg-[color:var(--color-panel-800)]'
                    }`}
                >
                  {day}
                </button>
            );
          })}
        </div>
      </div>
  );
}

/** A single clickable field that opens a popover with a real clickable calendar (click a day to
 * start the range, click another to finish it) - not a native date-typing input. */
export function DateRangePicker({
  from,
  to,
  onChange,
  allowClear,
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initial = from ? new Date(`${from}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function navigate(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function selectDay(iso: string) {
    if (!from || (from && to)) {
      onChange(iso, '');
    } else if (iso < from) {
      onChange(iso, from);
    } else {
      onChange(from, iso);
    }
  }

  const label = from || to ? `${from ? formatDisplay(from) : '…'} – ${to ? formatDisplay(to) : '…'}` : 'Select date range';

  return (
      <div ref={ref} className="relative">
        <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={
                className ??
                'rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-panel-900)] px-3 py-2 text-sm text-[color:var(--color-text-100)] outline-none hover:border-[color:var(--color-accent-primary)]/50'
            }
        >
          {label}
        </button>
        {open && (
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-[color:var(--color-border-800)] bg-[color:var(--color-panel-900)] p-4 shadow-xl">
              <CalendarMonth
                  year={viewYear}
                  month={viewMonth}
                  from={from}
                  to={to}
                  onNavigate={navigate}
                  onSelectDay={selectDay}
              />
              <p className="mt-2 text-xs text-[color:var(--color-text-600)]">
                {!from ? 'Click a day to start the range.' : !to ? 'Click another day to finish the range.' : 'Click a day to start a new range.'}
              </p>
              <div className="mt-3 flex justify-between gap-2">
                {allowClear && (from || to) ? (
                    <button
                        type="button"
                        onClick={() => onChange('', '')}
                        className="text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
                    >
                      Clear
                    </button>
                ) : (
                    <span />
                )}
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-[color:var(--color-accent-primary)] px-3 py-1.5 text-xs font-semibold text-[color:var(--color-on-accent)]"
                >
                  Done
                </button>
              </div>
            </div>
        )}
      </div>
  );
}
