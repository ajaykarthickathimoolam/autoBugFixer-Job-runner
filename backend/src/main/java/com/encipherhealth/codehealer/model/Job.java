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
    private JobStatus status;
    @Builder.Default
    private List<JobStatusEvent> statusHistory = new ArrayList<>();
    @Builder.Default
    private List<JobLogEntry> logs = new ArrayList<>();
    private String prUrl;
    private String failureReason;

    /** Claude's clarifying question while status is AWAITING_INPUT; cleared on resume. */
    private String pendingQuestion;
    /** The Zoho Sprints sprint/backlog ID this ticket lives under - needed to post/read comments on it. */
    private String zohoItemContainerId;

    private Instant createdAt;
    private Instant updatedAt;

    public void transitionTo(JobStatus newStatus) {
        this.status = newStatus;
        this.statusHistory.add(JobStatusEvent.builder().status(newStatus).timestamp(Instant.now()).build());
    }
}
