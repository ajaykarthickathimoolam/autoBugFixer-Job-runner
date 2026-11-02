import type {
  BoardProjectSummary,
  BoardResponse,
  ClarificationLevel,
  DashboardStats,
  JobPageResponse,
  JobResponse,
  LlmProvider,
  PageKey,
  ProjectInput,
  ProjectOption,
  ProjectResponse,
  PulseOverview,
  SettingsResponse,
  TraceEvent,
  UserAccount,
  ZohoConnectionTestResponse,
  JiraConnectionTestResponse,
  ExceptionRecord,
  KnowledgeDocument,
} from './types';

const TOKEN_KEY = 'codehealer_token';
const USERNAME_KEY = 'codehealer_username';
const PAGE_ACCESS_KEY = 'codehealer_page_access';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function getPageAccess(): PageKey[] | null {
  const raw = localStorage.getItem(PAGE_ACCESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PageKey[];
  } catch {
    return null;
  }
}

export function setSession(token: string, username: string, pageAccess: PageKey[]) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  localStorage.setItem(PAGE_ACCESS_KEY, JSON.stringify(pageAccess));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(PAGE_ACCESS_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401 && path !== '/auth/login') {
    clearSession();
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = typeof body.error === 'string' ? body.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function toQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

export const api = {
  login: (username: string, password: string) =>
      request<{ token: string; username: string; pageAccess: PageKey[] }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
  register: (username: string, password: string) =>
      request<{ token: string; username: string; pageAccess: PageKey[] }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
  me: () => request<{ username: string; pageAccess: PageKey[] }>('/auth/me'),

  listProjects: () => request<ProjectResponse[]>('/projects'),
  getProject: (id: string) => request<ProjectResponse>(`/projects/${id}`),
  createProject: (body: ProjectInput) =>
      request<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (id: string, body: ProjectInput) =>
      request<ProjectResponse>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  listJobs: (params?: {
    projectId?: string;
    status?: string;
    ticketId?: string;
    ticketTitle?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) =>
      request<JobPageResponse>(
          `/jobs${toQueryString(
              params && {
                projectId: params.projectId,
                status: params.status,
                ticketId: params.ticketId,
                ticketTitle: params.ticketTitle,
                from: params.from,
                to: params.to,
                page: params.page?.toString(),
                pageSize: params.pageSize?.toString(),
              }
          )}`
      ),
  getJob: (id: string) => request<JobResponse>(`/jobs/${id}`),
  retryJob: (id: string) => request<JobResponse>(`/jobs/${id}/retry`, { method: 'POST' }),
  deleteJob: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
  pauseJob: (id: string) => request<JobResponse>(`/jobs/${id}/pause`, { method: 'POST' }),
  resumeJob: (id: string) => request<JobResponse>(`/jobs/${id}/resume`, { method: 'POST' }),
  cancelJob: (id: string, reason?: string) =>
      request<JobResponse>(`/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  approveJob: (id: string) => request<JobResponse>(`/jobs/${id}/approve`, { method: 'POST' }),
  rejectJob: (id: string, reason?: string) =>
      request<JobResponse>(`/jobs/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  recordDisposition: (id: string, disposition: 'ACCEPTED' | 'REJECTED') =>
      request<JobResponse>(`/jobs/${id}/disposition`, { method: 'POST', body: JSON.stringify({ disposition }) }),
  answerJob: (id: string, answer: string) =>
      request<JobResponse>(`/jobs/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),
  jobTrace: (id: string) => request<TraceEvent[]>(`/jobs/${id}/trace`),

  dashboardStats: (params?: { projectId?: string; from?: string; to?: string; groupBy?: string }) =>
      request<DashboardStats>(`/dashboard/stats${toQueryString(params)}`),

  getSettings: () => request<SettingsResponse>('/admin/settings'),
  updateSettings: (body: {
    claudeApiToken?: string;
    maxConcurrentJobs?: number;
    zohoPollIntervalSeconds?: number;
    clarificationLevel?: ClarificationLevel;
    llmProvider?: LlmProvider;
    azureOpenAiEndpoint?: string;
    azureOpenAiApiKey?: string;
    azureOpenAiApiVersion?: string;
    azureOpenAiDeployment?: string;
    killSwitchArmed?: boolean;
    killSwitchReason?: string;
    requireChangePlanApproval?: boolean;
    testsMustPass?: boolean;
    securityScansEnabled?: boolean;
    failClosedEnabled?: boolean;
  }) => request<SettingsResponse>('/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),

  testGptConnection: (body: { endpoint?: string; apiKey?: string; apiVersion?: string; deployment?: string }) =>
      request<{ ok: boolean; message: string; model: string | null }>('/admin/settings/gpt/test-connection', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

  testZohoConnection: (body: { clientId: string; clientSecret: string; code: string }) =>
      request<ZohoConnectionTestResponse>('/admin/zoho/test-connection', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

  testJiraConnection: (body: { baseUrl: string; email: string; apiToken: string }) =>
      request<JiraConnectionTestResponse>('/admin/jira/test-connection', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

  listUsers: () => request<UserAccount[]>('/admin/users'),
  listProjectOptions: () => request<ProjectOption[]>('/admin/users/projects'),
  createUser: (body: { username: string; password: string; pageAccess: PageKey[]; allowedProjectIds: string[] }) =>
      request<UserAccount>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  resetUserPassword: (id: string, password: string) =>
      request<void>(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  updateUserAccess: (id: string, pageAccess: PageKey[], allowedProjectIds: string[]) =>
      request<UserAccount>(`/admin/users/${id}/access`, {
        method: 'PUT',
        body: JSON.stringify({ pageAccess, allowedProjectIds }),
      }),
  deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),

  listBoardProjects: () => request<BoardProjectSummary[]>('/board/projects'),
  getBoard: (projectId: string) => request<BoardResponse>(`/board/projects/${projectId}`),

  pulseOverview: () => request<PulseOverview>('/pulse/overview'),
  pulseExceptions: () => request<ExceptionRecord[]>('/pulse/exceptions'),
  resolveException: (id: string) =>
      request<ExceptionRecord>(`/pulse/exceptions/${id}/resolve`, { method: 'POST' }),

  listKnowledge: (projectId: string) =>
      request<KnowledgeDocument[]>(`/sage${toQueryString({ projectId })}`),
  ingestKnowledge: (body: {
    projectId: string;
    title: string;
    source?: string;
    content: string;
    visibility?: string;
  }) => request<KnowledgeDocument>('/sage', { method: 'POST', body: JSON.stringify(body) }),
  updateKnowledge: (
      id: string,
      body: { title?: string; source?: string; content?: string; visibility?: string }
  ) => request<KnowledgeDocument>(`/sage/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteKnowledge: (id: string) => request<void>(`/sage/${id}`, { method: 'DELETE' }),

  recoveryBackup: () => request<Record<string, unknown>>('/admin/recovery/backup'),
  recoveryRestore: (payload: Record<string, unknown>) =>
      request<Record<string, unknown>>('/admin/recovery/restore', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  recoveryDrill: () =>
      request<Record<string, unknown>>('/admin/recovery/drill', { method: 'POST' }),
};
