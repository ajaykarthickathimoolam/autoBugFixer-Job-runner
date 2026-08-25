package com.encipherhealth.codehealer.dto;

import com.encipherhealth.codehealer.model.JobLogEntry;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;

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
        Instant updatedAt
) {
}
