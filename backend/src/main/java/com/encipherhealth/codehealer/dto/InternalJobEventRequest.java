package com.encipherhealth.codehealer.dto;

import java.util.List;

/**
 * Payload the job-runner posts back to the backend as a task progresses.
 * `status` must match a {@link com.encipherhealth.codehealer.model.JobStatus} name when present.
 */
public record InternalJobEventRequest(
        String status,
        String message,
        String logLevel,
        String logMessage,
        String prUrl,
        String changePlan,
        String securityScanSummary,
        String securityRemediationPlan,
        String diffScopeSummary,
        List<String> diffScopeFiles,
        String llmProvider,
        List<String> filesRead,
        List<String> filesChanged,
        List<String> commandsRun,
        String testsNotRun,
        Integer promptTokens,
        Integer completionTokens
) {
}
