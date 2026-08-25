package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.ZohoConnectionTestResponse;
import com.encipherhealth.codehealer.dto.ZohoProjectSummary;
import com.encipherhealth.codehealer.service.ZohoJObjUnfurler.UnfurledRecord;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;

/**
 * Drives the whole Self Client hand-off from the Admin page in one shot: exchanges the
 * authorization code for a refresh token, then immediately uses the access token to look up the
 * caller's team and every project under it, so they never have to run a curl command themselves.
 */
@Service
@Slf4j
public class ZohoConnectionTestService {

    private record TokenPair(String accessToken, String refreshToken) {
    }

    private final WebClient accountsClient;
    private final WebClient apiClient;

    public ZohoConnectionTestService(WebClient.Builder builder,
                                      @Value("${app.zoho.accounts-base-url}") String accountsBaseUrl,
                                      @Value("${app.zoho.api-base-url}") String apiBaseUrl) {
        this.accountsClient = builder.baseUrl(accountsBaseUrl).build();
        this.apiClient = builder.baseUrl(apiBaseUrl).build();
    }

    public ZohoConnectionTestResponse testConnection(String clientId, String clientSecret, String code) {
        TokenPair tokens = exchangeCodeForTokens(clientId, clientSecret, code);

        JsonNode teamsResponse = get("/teams/", tokens.accessToken());
        JsonNode portals = teamsResponse.path("portals");
        if (!portals.isArray() || portals.isEmpty()) {
            throw new IllegalStateException("Zoho returned no team/portal for this account");
        }
        JsonNode portal = portals.get(0);
        String teamId = portal.path("zsoid").asText(null);
        String teamName = portal.path("teamName").asText(null);
        if (teamId == null) {
            throw new IllegalStateException("Could not find a team id (zsoid) in Zoho's /teams/ response");
        }

        JsonNode projectsResponse = get("/team/" + teamId + "/projects/?action=allprojects", tokens.accessToken());
        JsonNode prefixObj = projectsResponse.path("prefixObj");
        List<UnfurledRecord> unfurled = ZohoJObjUnfurler.unfurl(projectsResponse, "project_prop", "projectIds", "projectJObj");

        List<ZohoProjectSummary> projects = unfurled.stream()
                .map(r -> new ZohoProjectSummary(
                        r.id(),
                        ZohoJObjUnfurler.textOf(r.properties(), "projName"),
                        prefixObj.path(r.id()).asText(null)))
                .sorted((a, b) -> {
                    String an = a.name() != null ? a.name() : "";
                    String bn = b.name() != null ? b.name() : "";
                    return an.compareToIgnoreCase(bn);
                })
                .toList();

        return new ZohoConnectionTestResponse(tokens.refreshToken(), teamId, teamName, projects);
    }

    private TokenPair exchangeCodeForTokens(String clientId, String clientSecret, String code) {
        JsonNode response = accountsClient.post()
                .uri(uriBuilder -> uriBuilder.path("/oauth/v2/token")
                        .queryParam("grant_type", "authorization_code")
                        .queryParam("client_id", clientId)
                        .queryParam("client_secret", clientSecret)
                        .queryParam("redirect_uri", "https://sprints.zoho.com")
                        .queryParam("code", code)
                        .build())
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(30));

        if (response == null || response.has("error")) {
            throw new IllegalStateException("Zoho token exchange failed: " + (response != null ? response.toString() : "empty response"));
        }
        String accessToken = response.path("access_token").asText(null);
        String refreshToken = response.path("refresh_token").asText(null);
        if (accessToken == null || refreshToken == null) {
            throw new IllegalStateException("Zoho did not return both an access and refresh token: " + response
                    + " (the code may already have been used - generate a fresh one and try again)");
        }
        return new TokenPair(accessToken, refreshToken);
    }

    private JsonNode get(String path, String accessToken) {
        JsonNode response = apiClient.get()
                .uri(path)
                .header("Authorization", "Zoho-oauthtoken " + accessToken)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(30));
        if (response == null) {
            throw new IllegalStateException("Empty response from Zoho for " + path);
        }
        if ("failed".equalsIgnoreCase(response.path("status").asText(null))) {
            throw new IllegalStateException("Zoho request to " + path + " failed: " + response);
        }
        return response;
    }
}
