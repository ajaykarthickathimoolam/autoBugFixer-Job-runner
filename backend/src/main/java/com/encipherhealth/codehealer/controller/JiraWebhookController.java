package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.jira.JiraText;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.service.EncryptionService;
import com.encipherhealth.codehealer.service.JobOrchestrationService;
import com.encipherhealth.codehealer.service.ticket.TicketPlatform;
import com.encipherhealth.codehealer.service.ticket.TicketPlatformRegistry;
import com.encipherhealth.codehealer.service.ticket.TicketPollerService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Jira doorbell: keeps the issue key, discards ticket content, re-fetches from REST.
 */
@RestController
@Slf4j
public class JiraWebhookController {

    static final String SECRET_HEADER = "X-CodeHealer-Secret";
    private static final Set<String> COMMENT_EVENTS = Set.of("comment_created", "comment_updated");

    private final ProjectRepository projectRepository;
    private final JobRepository jobRepository;
    private final EncryptionService encryptionService;
    private final TicketPlatformRegistry platformRegistry;
    private final TicketPollerService ticketPollerService;
    private final JobOrchestrationService jobOrchestrationService;
    private final String globalWebhookSecret;

    public JiraWebhookController(ProjectRepository projectRepository,
                                 JobRepository jobRepository,
                                 EncryptionService encryptionService,
                                 TicketPlatformRegistry platformRegistry,
                                 TicketPollerService ticketPollerService,
                                 JobOrchestrationService jobOrchestrationService,
                                 @Value("${app.jira.webhook-secret:}") String globalWebhookSecret) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
        this.encryptionService = encryptionService;
        this.platformRegistry = platformRegistry;
        this.ticketPollerService = ticketPollerService;
        this.jobOrchestrationService = jobOrchestrationService;
        this.globalWebhookSecret = globalWebhookSecret;
    }

    @PostMapping("/api/webhooks/jira")
    public ResponseEntity<Map<String, String>> receive(
            @RequestParam(name = "secret", required = false) String secretParam,
            @RequestParam(name = "projectId", required = false) String projectId,
            @RequestHeader(name = SECRET_HEADER, required = false) String secretHeader,
            @RequestBody(required = false) JiraWebhookRequest body) {

        String issueKey = body == null || body.issue() == null ? null : body.issue().key();
        if (!JiraText.isIssueKey(issueKey)) {
            return response(HttpStatus.BAD_REQUEST, "no-issue-key", null);
        }
        String key = JiraText.requireIssueKey(issueKey);

        Optional<Project> matched = resolveProject(projectId, key, secretParam, secretHeader);
        if (matched.isEmpty()) {
            log.warn("Rejected Jira webhook for {} — no matching project or secret", key);
            return response(HttpStatus.UNAUTHORIZED, "unauthorized", null);
        }
        Project project = matched.get();
        String eventType = body.webhookEvent() == null ? "unknown" : body.webhookEvent();

        try {
            if (COMMENT_EVENTS.contains(eventType)) {
                handleComment(project, key);
            } else {
                TicketPlatform platform = platformRegistry.forProject(project);
                Optional<NormalizedTicket> ticket = platform.fetchTicket(project, key);
                ticket.ifPresent(t -> ticketPollerService.ingestDiscoveredTicket(project, t));
            }
        } catch (Exception e) {
            log.error("Jira doorbell failed for {} on project {}", key, project.getId(), e);
        }

        log.info("Jira doorbell accepted for {} ({}) on project {}", key, eventType, project.getId());
        return response(HttpStatus.ACCEPTED, "accepted", key);
    }

    private void handleComment(Project project, String issueKey) {
        for (Job job : jobRepository.findByStatus(JobStatus.AWAITING_INPUT)) {
            if (!project.getId().equals(job.getProjectId()) || !issueKey.equalsIgnoreCase(job.getTicketId())) {
                continue;
            }
            Instant askedAt = job.getStatusHistory().stream()
                    .filter(e -> e.getStatus() == JobStatus.AWAITING_INPUT)
                    .map(JobStatusEvent::getTimestamp)
                    .max(Instant::compareTo)
                    .orElse(job.getUpdatedAt());
            TicketPlatform platform = platformRegistry.forProject(project);
            platform.findReplyAfter(project, job, askedAt).ifPresent(answer -> {
                log.info("Jira comment doorbell resumed paused job {}", job.getId());
                jobOrchestrationService.resumeAfterInput(job, project, answer);
            });
        }
    }

    private Optional<Project> resolveProject(String projectId, String issueKey,
                                             String secretParam, String secretHeader) {
        if (projectId != null && !projectId.isBlank()) {
            return projectRepository.findById(projectId)
                    .filter(p -> p.resolvedPlatform() == AgilePlatform.JIRA)
                    .filter(p -> authorized(p, secretParam, secretHeader));
        }
        String prefix = issueKey.substring(0, issueKey.indexOf('-'));
        return projectRepository.findAll().stream()
                .filter(p -> p.resolvedPlatform() == AgilePlatform.JIRA)
                .filter(p -> p.getJiraProjectKey() != null
                        && p.getJiraProjectKey().strip().equalsIgnoreCase(prefix))
                .filter(p -> authorized(p, secretParam, secretHeader))
                .findFirst();
    }

    private boolean authorized(Project project, String secretParam, String secretHeader) {
        String presented = secretHeader != null ? secretHeader : secretParam;
        if (presented == null || presented.isBlank()) {
            return false;
        }
        String projectSecret = encryptionService.decrypt(project.getJiraWebhookSecretEncrypted());
        if (JiraText.notBlank(projectSecret) && matches(projectSecret, presented)) {
            return true;
        }
        return JiraText.notBlank(globalWebhookSecret) && matches(globalWebhookSecret, presented);
    }

    private static boolean matches(String expected, String presented) {
        return MessageDigest.isEqual(
                expected.strip().getBytes(StandardCharsets.UTF_8),
                presented.strip().getBytes(StandardCharsets.UTF_8));
    }

    private static ResponseEntity<Map<String, String>> response(HttpStatus status, String outcome, String issueKey) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("status", outcome);
        if (issueKey != null) {
            payload.put("issueKey", issueKey);
        }
        return ResponseEntity.status(status).body(payload);
    }

    public record JiraWebhookRequest(IssueRef issue, String webhookEvent) {
        public record IssueRef(String key) {
        }
    }
}
