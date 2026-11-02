package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.GuardDecision;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobLogEntry;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.SageCitation;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.service.ticket.TicketPlatformRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class L1SupportService {

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final GuardService guardService;
    private final SageService sageService;
    private final TraceService traceService;
    private final AzureOpenAiChatService azureOpenAiChatService;
    private final SseBroadcastService sseBroadcastService;
    private final TicketPlatformRegistry ticketPlatformRegistry;
    private final ExceptionQueueService exceptionQueueService;
    private final ObjectMapper objectMapper;

    public void investigate(Job job) {
        Project project = projectRepository.findById(job.getProjectId()).orElse(null);
        GuardDecision decision = guardService.authorize(job, "L1_INVESTIGATE", "workforce");
        if (!decision.allowed()) {
            halt(job, decision);
            return;
        }
        job.transitionTo(JobStatus.ANALYZING);
        job.setUpdatedAt(Instant.now());
        appendLog(job, "L1 investigation started");
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        String query = ((job.getTicketTitle() == null ? "" : job.getTicketTitle()) + " "
                + (job.getTicketDescription() == null ? "" : job.getTicketDescription()));
        List<SageCitation> citations = sageService.retrieve(job.getProjectId(), query, 5);
        job.setL1Citations(new ArrayList<>(citations));
        traceService.record(job.getId(), job.getProjectId(), "TOOL", "workforce", "SAGE_RETRIEVE",
                citations.size() + " citation(s)");

        Optional<String> modelOut = azureOpenAiChatService.complete(
                "You are a governed L1 support agent. Use only the provided authorized sources. "
                        + "If they are insufficient, escalate. Reply with JSON only: "
                        + "{\"classification\":\"...\",\"draftResponse\":\"...\",\"escalate\":false,\"escalationReason\":null}",
                "Ticket: " + job.getTicketTitle() + "\n\n"
                        + job.getTicketDescription() + "\n\nAuthorized sources:\n"
                        + sageService.formatForPrompt(citations));

        boolean escalate = citations.isEmpty();
        String classification = citations.isEmpty() ? "unclassified" : "knowledge-match";
        String draft;
        String escalationReason = citations.isEmpty()
                ? "No authorized knowledge matched this ticket"
                : null;

        if (modelOut.isPresent()) {
            try {
                String json = extractJson(modelOut.get());
                JsonNode node = objectMapper.readTree(json);
                classification = textOr(node.path("classification").asText(), classification);
                if (node.path("escalate").asBoolean(false)) {
                    escalate = true;
                    escalationReason = textOr(node.path("escalationReason").asText(), "Model recommended escalation");
                }
                draft = textOr(node.path("draftResponse").asText(), null);
            } catch (Exception e) {
                draft = modelOut.get();
            }
        } else if (!citations.isEmpty()) {
            StringBuilder sb = new StringBuilder("Based on authorized sources:\n");
            for (SageCitation c : citations) {
                sb.append("- ").append(c.getTitle()).append(" (v").append(c.getVersion()).append("): ")
                        .append(c.getExcerpt()).append('\n');
            }
            sb.append("\nPlease confirm this draft before it is posted to the ticket.");
            draft = sb.toString();
        } else {
            draft = null;
        }

        job.setL1Classification(classification);
        job.setL1DraftResponse(draft);
        job.setL1EscalationReason(escalationReason);
        job.setUpdatedAt(Instant.now());

        if (escalate && (draft == null || draft.isBlank())) {
            GuardDecision esc = guardService.authorize(job, "L1_ESCALATE", "workforce");
            if (!esc.allowed()) {
                halt(job, esc);
                return;
            }
            job.transitionTo(JobStatus.ESCALATED);
            appendLog(job, "Escalated to human queue: " + escalationReason);
            jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            if (project != null) {
                try {
                    ticketPlatformRegistry.forProject(project)
                            .postQuestion(project, job, "EAO L1 escalated: " + escalationReason);
                } catch (Exception e) {
                    log.warn("Failed to post L1 escalation for job {}: {}", job.getId(), e.getMessage());
                }
            }
            traceService.record(job.getId(), job.getProjectId(), "OUTCOME", "workforce", "L1_ESCALATE", escalationReason);
            return;
        }

        job.transitionTo(JobStatus.AWAITING_APPROVAL);
        appendLog(job, "L1 draft ready for approval (" + classification + ")");
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "OUTCOME", "workforce", "L1_DRAFT", classification);
    }

    public void postApprovedResponse(Job job, String actor) {
        GuardDecision decision = guardService.authorize(job, "L1_RESPOND", actor);
        if (!decision.allowed()) {
            halt(job, decision);
            return;
        }
        Project project = projectRepository.findById(job.getProjectId()).orElse(null);
        if (project == null) {
            job.transitionTo(JobStatus.FAILED);
            job.setFailureReason("Project not found");
            job.setUpdatedAt(Instant.now());
            jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            return;
        }
        String body = "EAO L1 response (approved by " + actor + ")\n\n"
                + (job.getL1DraftResponse() == null ? "" : job.getL1DraftResponse());
        if (job.getL1Citations() != null && !job.getL1Citations().isEmpty()) {
            body += "\n\nSources:";
            for (SageCitation c : job.getL1Citations()) {
                body += "\n- " + c.getTitle() + " v" + c.getVersion();
            }
        }
        try {
            ticketPlatformRegistry.forProject(project).postQuestion(project, job, body);
        } catch (Exception e) {
            job.transitionTo(JobStatus.FAILED);
            job.setFailureReason("Failed to post L1 response: " + e.getMessage());
            job.setUpdatedAt(Instant.now());
            appendLog(job, job.getFailureReason());
            jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            exceptionQueueService.open(job, "L1_RESPOND", e.getMessage());
            return;
        }
        job.transitionTo(JobStatus.CLOSED);
        job.setUpdatedAt(Instant.now());
        appendLog(job, "Approved L1 response posted to the ticket");
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "OUTCOME", actor, "L1_RESPOND", "closed");
    }

    private void halt(Job job, GuardDecision decision) {
        JobStatus halt = parseHalt(decision.haltStatus());
        job.transitionTo(halt);
        if (halt == JobStatus.FAILED) {
            job.setFailureReason(decision.reason());
            exceptionQueueService.open(job, "GUARD", decision.reason());
        } else if (halt == JobStatus.PAUSED) {
            job.setPausedBy("guard");
        }
        job.setUpdatedAt(Instant.now());
        appendLog(job, "Guard denied: " + decision.reason());
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
    }

    private JobStatus parseHalt(String haltStatus) {
        try {
            return haltStatus == null ? JobStatus.FAILED : JobStatus.valueOf(haltStatus);
        } catch (Exception e) {
            return JobStatus.FAILED;
        }
    }

    private void appendLog(Job job, String message) {
        job.getLogs().add(JobLogEntry.builder()
                .timestamp(Instant.now())
                .level("INFO")
                .message(message)
                .build());
    }

    private static String textOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.strip();
    }

    private static String extractJson(String raw) {
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return raw.substring(start, end + 1);
        }
        return raw;
    }
}
