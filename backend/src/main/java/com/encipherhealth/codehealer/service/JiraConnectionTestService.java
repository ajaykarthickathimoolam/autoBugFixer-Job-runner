package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.JiraConnectionTestResponse;
import com.encipherhealth.codehealer.jira.JiraCloudClient;
import com.encipherhealth.codehealer.jira.JiraCloudClient.Site;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class JiraConnectionTestService {

    private final JiraCloudClient jiraCloudClient;

    public JiraConnectionTestResponse testConnection(String baseUrl, String email, String apiToken) {
        Site site = new Site(baseUrl, email, apiToken);
        if (!site.isComplete()) {
            throw new IllegalStateException("Jira site URL must be https, and email + API token are required");
        }
        JsonNode me = jiraCloudClient.myself(site);
        return new JiraConnectionTestResponse(
                me.path("displayName").asText(email),
                me.path("emailAddress").asText(email),
                me.path("timeZone").asText(""),
                jiraCloudClient.listProjects(site));
    }
}
