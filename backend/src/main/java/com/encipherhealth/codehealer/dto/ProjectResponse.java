package com.encipherhealth.codehealer.dto;

import java.time.Instant;
import java.util.List;

public record ProjectResponse(
        String id,
        String name,
        String architectureMd,
        boolean hasCliqWebhook,
        boolean hasGithubSshKey,
        boolean hasGithubPat,
        String zohoTeamId,
        String zohoProjectIdExternal,
        boolean hasZohoOAuthCredentials,
        String agilePlatform,
        String agentMode,
        String jiraBaseUrl,
        String jiraProjectKey,
        String jiraEmail,
        boolean hasJiraApiToken,
        String jiraIssueTypes,
        boolean hasJiraWebhookSecret,
        Instant lastPolledAt,
        List<ServiceConfigResponse> services,
        Instant createdAt,
        Instant updatedAt
) {
}
