package com.encipherhealth.codehealer.dto;

import java.util.List;

/**
 * Sent by the backend to the job-runner's POST /tasks endpoint to kick off a fix task.
 * The job-runner reports progress back to the backend's internal API using its own
 * BACKEND_INTERNAL_URL / shared-secret configuration, so no callback URL is included here.
 */
public record TaskRequest(
        String jobId,
        String ticketId,
        String ticketTitle,
        String ticketDescription,
        String projectId,
        String projectName,
        String projectArchitectureMd,
        List<TaskServiceInfo> services,
        String githubSshPrivateKey,
        String githubPat,
        String claudeApiToken,
        String clarificationLevel,
        String llmProvider,
        String azureOpenAiEndpoint,
        String azureOpenAiApiKey,
        String azureOpenAiApiVersion,
        String azureOpenAiDeployment,
        String phase,
        String approvedChangePlan,
        boolean requireChangePlanApproval,
        boolean testsMustPass,
        boolean securityScansEnabled,
        String sageContext,
        String resumeFrom,
        String securityScanSummary
) {
}
