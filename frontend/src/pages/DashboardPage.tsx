import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { useJobEvents } from '../lib/sse';
import { StatusBadge } from '../components/StatusBadge';
import { DateRangePicker } from '../components/DateRangePicker';
import type { DashboardStats, JobResponse, JobStatus, ProjectResponse } from '../lib/types';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const JOBS_PAGE_SIZE = 6;

const STATUS_OPTIONS: JobStatus[] = [
  'RECEIVED',
  'ANALYZING',
  'CLONING',
  'FIXING',
  'VERIFYING',
  'AWAITING_INPUT',
  'PR_CREATED',
  'NOTIFIED',
  'FAILED',
];

const filterInputCls =
    'rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-panel-900)] px-3 py-2 text-sm outline-none';

export function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);

  // Chart filters
  const [projectId, setProjectId] = useState<string>('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Recent jobs filters (independent of the chart above)
  const [ticketIdInput, setTicketIdInput] = useState('');
  const [ticketTitleInput, setTicketTitleInput] = useState('');
  const [jobTicketId, setJobTicketId] = useState('');
  const [jobTicketTitle, setJobTicketTitle] = useState('');
  const [jobProjectId, setJobProjectId] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [jobFrom, setJobFrom] = useState('');
  const [jobTo, setJobTo] = useState('');

  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  // Debounce the free-text filters so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setJobTicketId(ticketIdInput), 400);
    return () => clearTimeout(t);
  }, [ticketIdInput]);
  useEffect(() => {
    const t = setTimeout(() => setJobTicketTitle(ticketTitleInput), 400);
    return () => clearTimeout(t);
  }, [ticketTitleInput]);

  async function refreshStats() {
    const res = await api.dashboardStats({
      projectId: projectId || undefined,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
      groupBy,
    });
    setStats(res);
  }

  async function refreshJobs(pageArg?: number) {
    setLoading(true);
    try {
      const res = await api.listJobs({
        projectId: jobProjectId || undefined,
        status: jobStatus || undefined,
        ticketId: jobTicketId || undefined,
        ticketTitle: jobTicketTitle || undefined,
        from: jobFrom ? `${jobFrom}T00:00:00Z` : undefined,
        to: jobTo ? `${jobTo}T23:59:59Z` : undefined,
        page: pageArg ?? page,
        pageSize: JOBS_PAGE_SIZE,
      });
      setJobs(res.items);
      setTotalCount(res.totalCount);
      setTotalPages(Math.max(1, res.totalPages));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, groupBy, from, to]);

  useEffect(() => {
    setPage(1);
    refreshJobs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobProjectId, jobStatus, jobTicketId, jobTicketTitle, jobFrom, jobTo]);

  useEffect(() => {
    refreshJobs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useJobEvents(() => {
    refreshStats();
    refreshJobs();
  });

  function clearJobFilters() {
    setTicketIdInput('');
    setTicketTitleInput('');
    setJobTicketId('');
    setJobTicketTitle('');
    setJobProjectId('');
    setJobStatus('');
    setJobFrom('');
    setJobTo('');
  }

  const currentPage = Math.min(page, totalPages);
  const jobFiltersActive =
      jobTicketId || jobTicketTitle || jobProjectId || jobStatus || jobFrom || jobTo;

  const chartData = useMemo(
      () => (stats?.buckets ?? []).map((b) => ({ label: b.label, Fixed: b.fixed, Failed: b.failed })),
      [stats]
  );

  return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="text-sm text-[color:var(--color-text-400)]">Live view of every automated fix job</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={filterInputCls}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
              ))}
            </select>
            <DateRangePicker
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
                className={filterInputCls}
            />
            <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
                className={filterInputCls}
            >
              <option value="day">By day</option>
              <option value="week">By week</option>
              <option value="month">By month</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total bugs" value={stats?.totalBugs ?? 0} accent="teal" />
          <StatCard label="Fixed" value={stats?.fixedCount ?? 0} accent="green" />
          <StatCard label="In progress" value={stats?.inProgressCount ?? 0} accent="amber" />
          <StatCard label="Failed" value={stats?.failedCount ?? 0} accent="red" />
        </div>

        <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-5">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-400)]">Fixed vs. Failed over time</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
                <XAxis dataKey="label" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
                <Tooltip
                    contentStyle={{ background: '#13151d', border: '1px solid #2a2e3a', borderRadius: 12 }}
                    labelStyle={{ color: '#f4f4f5' }}
                />
                <Bar dataKey="Fixed" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Failed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--color-text-400)]">Recent jobs</h2>
            <span className="text-xs text-[color:var(--color-text-600)]">{totalCount} total</span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
                placeholder="Ticket ID"
                value={ticketIdInput}
                onChange={(e) => setTicketIdInput(e.target.value)}
                className={`${filterInputCls} w-32`}
            />
            <input
                placeholder="Ticket name"
                value={ticketTitleInput}
                onChange={(e) => setTicketTitleInput(e.target.value)}
                className={`${filterInputCls} w-44`}
            />
            <select value={jobProjectId} onChange={(e) => setJobProjectId(e.target.value)} className={filterInputCls}>
              <option value="">All projects</option>
              {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
              ))}
            </select>
            <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} className={filterInputCls}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
              ))}
            </select>
            <DateRangePicker
                from={jobFrom}
                to={jobTo}
                onChange={(f, t) => {
                  setJobFrom(f);
                  setJobTo(t);
                }}
                allowClear
                className={filterInputCls}
            />
            {jobFiltersActive && (
                <button
                    onClick={clearJobFilters}
                    className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-2 text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
                >
                  Clear filters
                </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
              <tr className="text-xs text-[color:var(--color-text-400)]">
                <th className="pb-2 pr-4">Ticket ID</th>
                <th className="pb-2 pr-4">Ticket Name</th>
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">PR</th>
                <th className="pb-2 pr-4">Updated</th>
              </tr>
              </thead>
              <tbody>
              {jobs.map((job) => (
                  <tr
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="cursor-pointer border-t border-[color:var(--color-border-800)] hover:bg-[color:var(--color-panel-800)]"
                  >
                    <td className="py-2 pr-4 font-medium">{job.ticketId}</td>
                    <td className="py-2 pr-4">{job.ticketTitle || '—'}</td>
                    <td className="py-2 pr-4 text-[color:var(--color-text-400)]">{job.projectName ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-2 pr-4">
                      {job.prUrl ? (
                          <a
                              href={job.prUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[color:var(--color-accent-teal)] hover:underline"
                          >
                            View PR
                          </a>
                      ) : (
                          <span className="text-[color:var(--color-text-600)]">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-[color:var(--color-text-400)]">
                      {new Date(job.updatedAt).toLocaleString()}
                    </td>
                  </tr>
              ))}
              {!loading && totalCount === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[color:var(--color-text-600)]">
                      No jobs match these filters
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>

          {totalCount > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[color:var(--color-text-600)]">
                  Showing {(currentPage - 1) * JOBS_PAGE_SIZE + 1}-{Math.min(currentPage * JOBS_PAGE_SIZE, totalCount)} of{' '}
                  {totalCount}
                </span>
                <div className="flex items-center gap-1">
                  <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-[color:var(--color-border-800)] px-2.5 py-1.5 text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`h-8 w-8 rounded-lg border text-xs font-medium ${
                              p === currentPage
                                  ? 'border-[color:var(--color-accent-primary)] bg-[color:var(--color-accent-primary)]/10 text-[color:var(--color-accent-primary)]'
                                  : 'border-[color:var(--color-border-800)] text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]'
                          }`}
                      >
                        {p}
                      </button>
                  ))}
                  <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-[color:var(--color-border-800)] px-2.5 py-1.5 text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: 'green' | 'teal' | 'amber' | 'red' }) {
  const colors: Record<string, string> = {
    green: 'text-[color:var(--color-accent-green)]',
    teal: 'text-[color:var(--color-accent-teal)]',
    amber: 'text-[color:var(--color-accent-amber)]',
    red: 'text-[color:var(--color-accent-red)]',
  };
  return (
      <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-5">
        <p className="text-xs font-medium text-[color:var(--color-text-400)]">{label}</p>
        <p className={`mt-2 text-3xl font-semibold tracking-tight ${colors[accent]}`}>{value}</p>
      </div>
  );
}
