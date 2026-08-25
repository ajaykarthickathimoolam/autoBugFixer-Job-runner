package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.InternalJobEventRequest;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobLogEntry;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.service.CliqNotificationService;
import com.encipherhealth.codehealer.service.JobCompletionRegistry;
import com.encipherhealth.codehealer.service.SseBroadcastService;
import com.encipherhealth.codehealer.service.ticket.TicketPlatformRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/**
 * Receives progress callbacks from the job-runner as it works a task
 * (CLONING -> FIXING -> VERIFYING -> PR_CREATED / FAILED).
 */
@RestController
@RequestMapping("/api/internal/jobs")
@RequiredArgsConstructor
@Slf4j
public class InternalJobEventController {

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final SseBroadcastService sseBroadcastService;
    private final CliqNotificationService cliqNotificationService;
    private final JobCompletionRegistry jobCompletionRegistry;
    private final TicketPlatformRegistry ticketPlatformRegistry;

    @Value("${app.job-runner.shared-secret}")
    private String sharedSecret;

    @PostMapping("/{jobId}/events")
    public ResponseEntity<?> handleEvent(@PathVariable String jobId,
                                          @RequestHeader("X-Internal-Secret") String secret,
                                          @RequestBody InternalJobEventRequest event) {
        if (!isValidSecret(secret)) {
            return ResponseEntity.status(401).build();
        }

        Job job = jobRepository.findById(jobId).orElse(null);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }

        if (event.logMessage() != null) {
            job.getLogs().add(JobLogEntry.builder()
                    .timestamp(Instant.now())
                    .level(event.logLevel() != null ? event.logLevel() : "INFO")
                    .message(event.logMessage())
                    .build());
        }

        JobStatus newStatus = event.status() != null ? JobStatus.valueOf(event.status()) : null;
        if (newStatus != null) {
            job.transitionTo(newStatus);
            if (newStatus == JobStatus.PR_CREATED) {
                job.setPrUrl(event.prUrl());
            }
            if (newStatus == JobStatus.FAILED) {
                job.setFailureReason(event.message());
            }
            if (newStatus == JobStatus.AWAITING_INPUT) {
                job.setPendingQuestion(event.message());
            }
        }
        job.setUpdatedAt(Instant.now());
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        Project project = projectRepository.findById(job.getProjectId()).orElse(null);

        if (newStatus == JobStatus.PR_CREATED) {
            if (project != null) {
                cliqNotificationService.notifyPrCreated(project, job);
                ticketPlatformRegistry.forProject(project).notifyPrCreated(project, job);
            }
            job.transitionTo(JobStatus.NOTIFIED);
            job.setUpdatedAt(Instant.now());
            jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            jobCompletionRegistry.complete(jobId);
        } else if (newStatus == JobStatus.FAILED) {
            if (project != null) {
                cliqNotificationService.notifyFailure(project, job);
                ticketPlatformRegistry.forProject(project).notifyFailure(project, job);
            }
            jobCompletionRegistry.complete(jobId);
        } else if (newStatus == JobStatus.AWAITING_INPUT && project != null) {
            // Deliberately do NOT complete the registry here - JobOrchestrationService keeps
            // holding the per-service lock and waiting until a human reply is detected by the
            // poller and resumeAfterInput() is called.
            try {
                ticketPlatformRegistry.forProject(project).postQuestion(project, job, event.message());
            } catch (Exception e) {
                log.warn("Failed to post clarifying question to ticket for job {}: {}", jobId, e.getMessage());
            }
        }

        return ResponseEntity.noContent().build();
    }

    private boolean isValidSecret(String provided) {
        return provided != null && MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8),
                sharedSecret.getBytes(StandardCharsets.UTF_8));
    }
}
