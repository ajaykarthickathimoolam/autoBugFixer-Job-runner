package com.encipherhealth.codehealer.service.ticket;

import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.jira.JiraCloudClient;
import com.encipherhealth.codehealer.jira.JiraCloudClient.JiraComment;
import com.encipherhealth.codehealer.jira.JiraText;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.Project;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class JiraTicketPlatform implements TicketPlatform {

    private final JiraCloudClient jira;

    @Override
    public AgilePlatform platform() {
        return AgilePlatform.JIRA;
    }

    @Override
    public boolean isConfigured(Project project) {
        return jira.isConfigured(project);
    }

    @Override
    public List<NormalizedTicket> discoverNewTickets(Project project, Instant cursor) {
        if (cursor == null) {
            List<NormalizedTicket> existing = List.of();
            try {
                existing = jira.searchAllInProject(project);
            } catch (Exception e) {
                log.warn("Jira baseline count failed for project {}: {}", project.getId(), e.getMessage());
            }
            log.info("First poll for Jira project {} - recording {} existing issue(s) as baseline, no jobs created",
                    project.getId(), existing.size());
            return List.of();
        }
        Instant since = cursor.minusSeconds(120);
        return jira.searchCreatedSince(project, since);
    }

    @Override
    public BoardResponse fetchBoard(Project project) {
        return jira.fetchBoard(project);
    }

    @Override
    public void postQuestion(Project project, Job job, String question) {
        String body = "**CodeHealer — needs clarification**\n\n"
                + jira.questionMarker() + "\n\n> " + (question == null ? "" : question.replace("\n", "\n> "))
                + "\n\n---\nAutomated by CodeHealer. Reply to this ticket with the answer to resume the fix.";
        jira.comment(project, job.getTicketId(), body);
    }

    @Override
    public Optional<String> findReplyAfter(Project project, Job job, Instant since) {
        String configuredEmail = project.getJiraEmail() == null ? "" : project.getJiraEmail().strip();
        String marker = jira.questionMarker();
        for (JiraComment comment : jira.listComments(project, job.getTicketId())) {
            if (comment.created() == null || !comment.created().isAfter(since)) {
                continue;
            }
            String body = comment.bodyMarkdown() == null ? "" : comment.bodyMarkdown();
            if (body.contains(marker)) {
                continue;
            }
            if (!configuredEmail.isBlank() && configuredEmail.equalsIgnoreCase(comment.authorEmail())) {
                continue;
            }
            String text = body.strip();
            if (!text.isBlank()) {
                return Optional.of(text);
            }
        }
        return Optional.empty();
    }

    @Override
    public void notifyPrCreated(Project project, Job job) {
        if (job.getPrUrl() == null || job.getPrUrl().isBlank()) {
            return;
        }
        try {
            String title = job.getTicketTitle() != null ? job.getTicketTitle() : job.getTicketId();
            String body = "**CodeHealer — pull request raised**\n\n[View the pull request](" + job.getPrUrl() + ")\n\n"
                    + "This pull request requires human review. CodeHealer does not merge.\n\n---\nAutomated by CodeHealer.";
            jira.comment(project, job.getTicketId(), body);
            jira.linkPullRequest(project, job.getTicketId(), job.getPrUrl(), "Fix " + title);
        } catch (Exception e) {
            log.warn("Failed to write PR back to Jira for job {}: {}", job.getId(), e.getMessage());
        }
    }

    @Override
    public void notifyFailure(Project project, Job job) {
        try {
            String reason = job.getFailureReason() != null ? job.getFailureReason() : "unknown error";
            String body = "**CodeHealer — failed to fix this ticket**\n\n> " + reason.replace("\n", "\n> ")
                    + "\n\n---\nAutomated by CodeHealer.";
            jira.comment(project, job.getTicketId(), body);
        } catch (Exception e) {
            log.warn("Failed to write failure back to Jira for job {}: {}", job.getId(), e.getMessage());
        }
    }

    @Override
    public Optional<NormalizedTicket> fetchTicket(Project project, String ticketId) {
        if (!JiraText.isIssueKey(ticketId)) {
            return Optional.empty();
        }
        String key = JiraText.requireIssueKey(ticketId);
        String expected = project.getJiraProjectKey() == null ? "" : project.getJiraProjectKey().strip().toUpperCase();
        if (!expected.isBlank() && !key.startsWith(expected + "-")) {
            return Optional.empty();
        }
        try {
            return Optional.of(jira.fetchTicket(project, key));
        } catch (Exception e) {
            log.warn("Failed to fetch Jira issue {} for project {}: {}", key, project.getId(), e.getMessage());
            return Optional.empty();
        }
    }
}
