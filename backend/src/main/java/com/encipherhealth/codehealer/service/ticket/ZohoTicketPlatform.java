package com.encipherhealth.codehealer.service.ticket;

import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.service.ZohoBoardService;
import com.encipherhealth.codehealer.service.ZohoCommentsService;
import com.encipherhealth.codehealer.service.ZohoOAuthTokenService;
import com.encipherhealth.codehealer.service.ZohoSprintsPollerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class ZohoTicketPlatform implements TicketPlatform {

    private final ZohoSprintsPollerService zohoSprintsPollerService;
    private final ZohoBoardService zohoBoardService;
    private final ZohoCommentsService zohoCommentsService;
    private final ZohoOAuthTokenService zohoOAuthTokenService;

    @Override
    public AgilePlatform platform() {
        return AgilePlatform.ZOHO;
    }

    @Override
    public boolean isConfigured(Project project) {
        return project.getZohoTeamId() != null && !project.getZohoTeamId().isBlank()
                && project.getZohoProjectIdExternal() != null && !project.getZohoProjectIdExternal().isBlank()
                && project.getZohoRefreshTokenEncrypted() != null;
    }

    @Override
    public List<NormalizedTicket> discoverNewTickets(Project project, Instant cursor) {
        return zohoSprintsPollerService.discoverNewTickets(project, cursor);
    }

    @Override
    public BoardResponse fetchBoard(Project project) {
        return zohoBoardService.fetchBoard(project);
    }

    @Override
    public void postQuestion(Project project, Job job, String question) {
        String accessToken = zohoOAuthTokenService.getAccessToken(project);
        zohoCommentsService.postQuestion(
                project.getZohoTeamId(),
                project.getZohoProjectIdExternal(),
                job.getZohoItemContainerId(),
                job.getTicketId(),
                accessToken,
                question);
    }

    @Override
    public Optional<String> findReplyAfter(Project project, Job job, Instant since) {
        if (job.getZohoItemContainerId() == null) {
            return Optional.empty();
        }
        String accessToken = zohoOAuthTokenService.getAccessToken(project);
        return zohoCommentsService.findReplyAfter(
                project.getZohoTeamId(),
                project.getZohoProjectIdExternal(),
                job.getZohoItemContainerId(),
                job.getTicketId(),
                accessToken,
                since);
    }
}
