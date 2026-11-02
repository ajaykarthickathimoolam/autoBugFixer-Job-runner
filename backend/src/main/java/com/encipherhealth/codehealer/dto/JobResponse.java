package com.encipherhealth.codehealer.dto;

import com.encipherhealth.codehealer.model.JobLogEntry;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
import com.encipherhealth.codehealer.model.SageCitation;

import java.time.Instant;
import java.util.List;

public record JobResponse(
        String id,
        String ticketId,
        String ticketTitle,
        String ticketDescription,
        String creatorName,
        String assigneeName,
        String projectId,
        String projectName,
        List<String> serviceIds,
        JobStatus status,
        List<JobStatusEvent> statusHistory,
        List<JobLogEntry> logs,
        String prUrl,
        String failureReason,
        String pendingQuestion,
        Instant createdAt,
        Instant updatedAt,
        String missionType,
        String changePlan,
        String approvedBy,
        Instant approvedAt,
        String pausedBy,
        String cancelledBy,
        String cancellationReason,
        String securityScanSummary,
        String l1Classification,
        String l1DraftResponse,
        List<SageCitation> l1Citations,
        String l1EscalationReason,
        String resumeFrom
) {
}
