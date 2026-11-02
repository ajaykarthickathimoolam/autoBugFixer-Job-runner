package com.encipherhealth.codehealer.dto;

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
        String securityScanSummary
) {
}
