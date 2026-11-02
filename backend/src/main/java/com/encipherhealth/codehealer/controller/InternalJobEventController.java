package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.InternalJobEventRequest;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobLogEntry;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.service.CliqNotificationService;
import com.encipherhealth.codehealer.service.ExceptionQueueService;
import com.encipherhealth.codehealer.service.GuardService;
import com.encipherhealth.codehealer.service.IdempotencyService;
import com.encipherhealth.codehealer.service.JobCompletionRegistry;
import com.encipherhealth.codehealer.service.SecretRedactor;
import com.encipherhealth.codehealer.service.SseBroadcastService;
import com.encipherhealth.codehealer.service.TraceService;
import com.encipherhealth.codehealer.service.ticket.TicketPlatformRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

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
    private final TraceService traceService;
    private final ExceptionQueueService exceptionQueueService;
    private final IdempotencyService idempotencyService;
    private final GuardService guardService;

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
                    .message(SecretRedactor.redact(event.logMessage()))
                    .build());
        }

        String safeMessage = SecretRedactor.redact(event.message());
        applyEvidence(job, event);

        JobStatus newStatus = event.status() != null ? JobStatus.valueOf(event.status()) : null;
        if (newStatus != null) {
            job.transitionTo(newStatus);
            if (newStatus == JobStatus.PR_CREATED) {
                job.setPrUrl(event.prUrl());
            }
            if (newStatus == JobStatus.FAILED) {
                job.setFailureReason(safeMessage);
                job.setStopRequested(false);
            }
            if (newStatus == JobStatus.CANCELLED) {
                job.setStopRequested(false);
            }
            if (newStatus == JobStatus.AWAITING_INPUT) {
                job.setPendingQuestion(safeMessage);
            }
            if (newStatus == JobStatus.AWAITING_APPROVAL) {
                if (event.diffScopeSummary() != null && !event.diffScopeSummary().isBlank()) {
                    job.setDiffScopeSummary(SecretRedactor.redact(event.diffScopeSummary()));
                    job.setDiffScopeFiles(event.diffScopeFiles() == null ? new java.util.ArrayList<>() : event.diffScopeFiles());
                    job.setPendingApproval("DIFF_SCOPE");
                } else if (event.securityRemediationPlan() != null && !event.securityRemediationPlan().isBlank()) {
                    job.setSecurityRemediationPlan(event.securityRemediationPlan());
                    job.setPendingApproval("SECURITY");
                } else {
                    String plan = event.changePlan() != null ? event.changePlan() : safeMessage;
                    job.setChangePlan(plan);
                    job.setPendingApproval("CHANGE_PLAN");
                }
            }
            if (newStatus == JobStatus.PAUSED) {
                job.setPausedBy("guard");
            }
        }
        if (event.securityScanSummary() != null && !event.securityScanSummary().isBlank()) {
            job.setSecurityScanSummary(event.securityScanSummary());
        }
        if (event.changePlan() != null && !event.changePlan().isBlank() && newStatus != JobStatus.AWAITING_APPROVAL) {
            job.setChangePlan(event.changePlan());
        }
        job.setUpdatedAt(Instant.now());
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        if (newStatus != null) {
            traceService.record(jobId, job.getProjectId(), "OUTCOME", "workforce", newStatus.name(),
                    safeMessage != null ? safeMessage : SecretRedactor.redact(event.logMessage()));
        }

        Project project = projectRepository.findById(job.getProjectId()).orElse(null);

        if (newStatus == JobStatus.PR_CREATED) {
            String notifyKey = "notify:" + jobId;
            if (idempotencyService.lookup(notifyKey).isEmpty()) {
                if (project != null) {
                    cliqNotificationService.notifyPrCreated(project, job);
                    ticketPlatformRegistry.forProject(project).notifyPrCreated(project, job);
                }
                idempotencyService.remember(notifyKey, jobId, "NOTIFY", job.getPrUrl());
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
            exceptionQueueService.open(job, "JOB_FAILED", safeMessage);
            jobCompletionRegistry.complete(jobId);
        } else if (newStatus == JobStatus.PAUSED || newStatus == JobStatus.CANCELLED) {
            jobCompletionRegistry.complete(jobId);
        } else if (newStatus == JobStatus.AWAITING_APPROVAL) {
            // Hold the per-service lock until approve/reject, same as AWAITING_INPUT.
        } else if (newStatus == JobStatus.AWAITING_INPUT && project != null) {
            try {
                ticketPlatformRegistry.forProject(project).postQuestion(project, job, safeMessage);
            } catch (Exception e) {
                log.warn("Failed to post clarifying question to ticket for job {}: {}", jobId, e.getMessage());
            }
        }

        return ResponseEntity.noContent().build();
    }

    @GetMapping("/guard")
    public ResponseEntity<?> checkGuard(@RequestHeader("X-Internal-Secret") String secret,
                                         @RequestParam String jobId,
                                         @RequestParam String action) {
        if (!isValidSecret(secret)) {
            return ResponseEntity.status(401).build();
        }
        Job job = jobRepository.findById(jobId).orElse(null);
        if (job == null) {
            return ResponseEntity.ok(com.encipherhealth.codehealer.dto.GuardDecision.deny(
                    "Guard fail-closed: unknown job", "FAILED"));
        }
        return ResponseEntity.ok(guardService.authorize(job, action, "workforce"));
    }

    @GetMapping("/idempotency")
    public ResponseEntity<?> lookupIdempotency(@RequestHeader("X-Internal-Secret") String secret,
                                                @RequestParam String key) {
        if (!isValidSecret(secret)) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(java.util.Map.of(
                "exists", idempotencyService.lookup(key).isPresent(),
                "result", idempotencyService.lookup(key).orElse("")));
    }

    @PostMapping("/idempotency")
    public ResponseEntity<?> rememberIdempotency(@RequestHeader("X-Internal-Secret") String secret,
                                                  @RequestBody java.util.Map<String, String> body) {
        if (!isValidSecret(secret)) {
            return ResponseEntity.status(401).build();
        }
        String stored = idempotencyService.remember(
                body.get("key"), body.get("jobId"), body.get("action"), body.get("result"));
        return ResponseEntity.ok(java.util.Map.of("result", stored == null ? "" : stored));
    }

    private void applyEvidence(Job job, InternalJobEventRequest event) {
        if (event.llmProvider() != null && !event.llmProvider().isBlank()) {
            job.setLlmProvider(event.llmProvider());
        }
        if (event.filesRead() != null) {
            job.setFilesRead(merge(job.getFilesRead(), event.filesRead()));
        }
        if (event.filesChanged() != null) {
            job.setFilesChanged(merge(job.getFilesChanged(), event.filesChanged()));
        }
        if (event.commandsRun() != null) {
            job.setCommandsRun(merge(job.getCommandsRun(), event.commandsRun()));
        }
        if (event.testsNotRun() != null) {
            job.setTestsNotRun(event.testsNotRun());
        }
        if (event.promptTokens() != null && event.promptTokens() > 0) {
            job.setPromptTokens(event.promptTokens());
        }
        if (event.completionTokens() != null && event.completionTokens() > 0) {
            job.setCompletionTokens(event.completionTokens());
        }
    }

    private static List<String> merge(List<String> existing, List<String> incoming) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        if (existing != null) {
            values.addAll(existing);
        }
        values.addAll(incoming);
        return new ArrayList<>(values).stream().limit(100).toList();
    }

    private boolean isValidSecret(String provided) {
        return provided != null && MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8),
                sharedSecret.getBytes(StandardCharsets.UTF_8));
    }
}
