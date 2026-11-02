package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "jobs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Job {
    @Id
    private String id;
    private String ticketId;
    private String ticketTitle;
    private String ticketDescription;
    private String creatorName;
    private String assigneeName;
    private String projectId;
    @Builder.Default
    private List<String> serviceIds = new ArrayList<>();
    @Builder.Default
    private MissionType missionType = MissionType.CODING;
    private JobStatus status;
    @Builder.Default
    private List<JobStatusEvent> statusHistory = new ArrayList<>();
    @Builder.Default
    private List<JobLogEntry> logs = new ArrayList<>();
    private String prUrl;
    private String failureReason;
    /**
     * On retry, the pipeline step to continue from (CLONE, FIX, VERIFY, SCAN, PUSH, PR, PLAN).
     * Null on a first run.
     */
    private String resumeFrom;

    /** Claude's clarifying question while status is AWAITING_INPUT; cleared on resume. */
    private String pendingQuestion;
    /** The Zoho Sprints sprint/backlog ID this ticket lives under - needed to post/read comments on it. */
    private String zohoItemContainerId;

    private String changePlan;
    private String approvedBy;
    private Instant approvedAt;
    private String pausedBy;
    private String cancelledBy;
    private String cancellationReason;
    private String securityScanSummary;

    private String l1Classification;
    private String l1DraftResponse;
    @Builder.Default
    private List<SageCitation> l1Citations = new ArrayList<>();
    private String l1EscalationReason;

    private Instant createdAt;
    private Instant updatedAt;

    public void transitionTo(JobStatus newStatus) {
        this.status = newStatus;
        this.statusHistory.add(JobStatusEvent.builder().status(newStatus).timestamp(Instant.now()).build());
    }
}
