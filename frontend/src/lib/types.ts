export type PageKey = 'DASHBOARD' | 'PROJECTS' | 'ADMIN' | 'GUIDE' | 'BOARD';

export interface UserAccount {
  id: string;
  username: string;
  pageAccess: PageKey[];
  allowedProjectIds: string[];
  superAdmin: boolean;
  createdAt: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export type AgilePlatform = 'ZOHO' | 'JIRA';

export interface BoardProjectSummary {
  id: string;
  name: string;
  agilePlatform: AgilePlatform | string;
  externalId: string | null;
  lastPolledAt: string | null;
}

export interface BoardItemResponse {
  id: string;
  title: string | null;
  description: string | null;
  assigneeName: string | null;
  creatorName: string | null;
  startDate: string | null;
  endDate: string | null;
  createdTime: string | null;
  points: number | null;
  statusIdRaw: string | null;
  priorityIdRaw: string | null;
}

export interface BoardBucketResponse {
  id: string;
  name: string;
  isBacklog: boolean;
  items: BoardItemResponse[];
}

export interface BoardResponse {
  projectId: string;
  projectName: string;
  buckets: BoardBucketResponse[];
}

export type JobStatus =
    | 'RECEIVED'
    | 'ANALYZING'
    | 'CLONING'
    | 'FIXING'
    | 'VERIFYING'
    | 'SCANNING'
    | 'AWAITING_INPUT'
    | 'AWAITING_APPROVAL'
    | 'PAUSED'
    | 'PR_CREATED'
    | 'NOTIFIED'
    | 'CLOSED'
    | 'ESCALATED'
    | 'CANCELLED'
    | 'FAILED';

export type MissionType = 'CODING' | 'L1_SUPPORT';

export interface SageCitation {
  documentId: string;
  title: string;
  excerpt: string;
  version: number;
}

export interface JobLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface JobStatusEvent {
  status: JobStatus;
  timestamp: string;
}

export interface JobResponse {
  id: string;
  ticketId: string;
  ticketTitle: string | null;
  ticketDescription: string | null;
  creatorName: string | null;
  assigneeName: string | null;
  projectId: string;
  projectName: string | null;
  serviceIds: string[];
  status: JobStatus;
  statusHistory: JobStatusEvent[];
  logs: JobLogEntry[];
  prUrl: string | null;
  failureReason: string | null;
  pendingQuestion: string | null;
  createdAt: string;
  updatedAt: string;
  missionType: MissionType | string | null;
  changePlan: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  pausedBy: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  securityScanSummary: string | null;
  l1Classification: string | null;
  l1DraftResponse: string | null;
  l1Citations: SageCitation[] | null;
  l1EscalationReason: string | null;
  resumeFrom: string | null;
}

export interface JobPageResponse {
  items: JobResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ServiceConfig {
  id: string;
  name: string;
  repoUrl: string;
  baseBranch: string;
  architectureMd: string;
  buildCommand: string;
  testCommand: string;
}

export interface ServiceConfigInput {
  id?: string;
  name: string;
  repoUrl: string;
  baseBranch: string;
  architectureMd: string;
  buildCommand: string;
  testCommand: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  architectureMd: string;
  hasCliqWebhook: boolean;
  hasGithubSshKey: boolean;
  hasGithubPat: boolean;
  zohoTeamId: string | null;
  zohoProjectIdExternal: string | null;
  hasZohoOAuthCredentials: boolean;
  agilePlatform: AgilePlatform;
  jiraBaseUrl: string | null;
  jiraProjectKey: string | null;
  jiraEmail: string | null;
  hasJiraApiToken: boolean;
  jiraIssueTypes: string | null;
  hasJiraWebhookSecret: boolean;
  lastPolledAt: string | null;
  agentMode: MissionType | string;
  services: ServiceConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  architectureMd: string;
  zohoCliqWebhookUrl?: string;
  githubSshPrivateKey?: string;
  githubPat?: string;
  zohoTeamId?: string;
  zohoProjectIdExternal?: string;
  zohoOAuthClientId?: string;
  zohoOAuthClientSecret?: string;
  zohoRefreshToken?: string;
  agilePlatform?: AgilePlatform;
  jiraBaseUrl?: string;
  jiraProjectKey?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraIssueTypes?: string;
  jiraWebhookSecret?: string;
  agentMode?: MissionType;
  services: ServiceConfigInput[];
}

export interface DashboardBucket {
  label: string;
  total: number;
  fixed: number;
  failed: number;
}

export interface DashboardStats {
  totalBugs: number;
  fixedCount: number;
  failedCount: number;
  inProgressCount: number;
  buckets: DashboardBucket[];
}

export type ClarificationLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type LlmProvider = 'CLAUDE' | 'GPT';

export interface SettingsResponse {
  hasClaudeApiToken: boolean;
  maxConcurrentJobs: number;
  zohoPollIntervalSeconds: number;
  clarificationLevel: ClarificationLevel;
  llmProvider: LlmProvider | string;
  hasAzureOpenAiApiKey: boolean;
  azureOpenAiEndpoint: string | null;
  azureOpenAiApiVersion: string | null;
  azureOpenAiDeployment: string | null;
  killSwitchArmed: boolean;
  killSwitchReason: string | null;
  requireChangePlanApproval: boolean;
  testsMustPass: boolean;
  securityScansEnabled: boolean;
  failClosedEnabled: boolean;
}

export interface ZohoProjectSummary {
  id: string;
  name: string | null;
  prefix: string | null;
}

export interface ZohoConnectionTestResponse {
  refreshToken: string;
  teamId: string;
  teamName: string | null;
  projects: ZohoProjectSummary[];
}

export interface JiraProjectSummary {
  key: string;
  name: string;
}

export interface JiraConnectionTestResponse {
  displayName: string;
  email: string;
  timeZone: string;
  projects: JiraProjectSummary[];
}

export interface PulseOverview {
  killSwitchArmed: boolean;
  killSwitchReason: string | null;
  failClosedEnabled: boolean;
  activeJobs: number;
  maxConcurrentJobs: number;
  awaitingApproval: number;
  paused: number;
  openExceptions: number;
}

export interface ExceptionRecord {
  id: string;
  jobId: string;
  projectId: string;
  kind: string;
  message: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface KnowledgeDocument {
  id: string;
  projectId: string;
  title: string;
  source: string;
  content: string;
  version: number;
  visibility: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TraceEvent {
  id: string;
  jobId: string;
  projectId: string;
  kind: string;
  actor: string;
  action: string;
  detail: string;
  timestamp: string;
}
