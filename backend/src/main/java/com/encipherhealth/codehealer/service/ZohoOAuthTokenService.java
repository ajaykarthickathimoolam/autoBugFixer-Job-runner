package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Project;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Exchanges each project's stored Zoho refresh token for a short-lived access token, caching it
 * in memory until shortly before it expires. Uses the standard Zoho "Self Client" OAuth flow -
 * see https://api-console.zoho.com (Self Client) for generating the client id/secret/refresh
 * token, which are entered per-project on the Projects page.
 */
@Component
@Slf4j
public class ZohoOAuthTokenService {

    private record CachedToken(String accessToken, Instant expiresAt) {
    }

    private final WebClient webClient;
    private final EncryptionService encryptionService;
    private final Map<String, CachedToken> cache = new ConcurrentHashMap<>();

    public ZohoOAuthTokenService(WebClient.Builder builder,
                                  @Value("${app.zoho.accounts-base-url}") String accountsBaseUrl,
                                  EncryptionService encryptionService) {
        this.webClient = builder.baseUrl(accountsBaseUrl).build();
        this.encryptionService = encryptionService;
    }

    public String getAccessToken(Project project) {
        CachedToken cached = cache.get(project.getId());
        if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
            return cached.accessToken();
        }
        return refresh(project);
    }

    private synchronized String refresh(Project project) {
        CachedToken cached = cache.get(project.getId());
        if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
            return cached.accessToken();
        }

        String clientId = encryptionService.decrypt(project.getZohoOAuthClientIdEncrypted());
        String clientSecret = encryptionService.decrypt(project.getZohoOAuthClientSecretEncrypted());
        String refreshToken = encryptionService.decrypt(project.getZohoRefreshTokenEncrypted());
        if (clientId == null || clientSecret == null || refreshToken == null) {
            throw new IllegalStateException("Zoho OAuth credentials are not fully configured for project " + project.getId());
        }

        JsonNode response = webClient.post()
                .uri(uriBuilder -> uriBuilder.path("/oauth/v2/token")
                        .queryParam("refresh_token", refreshToken)
                        .queryParam("client_id", clientId)
                        .queryParam("client_secret", clientSecret)
                        .queryParam("grant_type", "refresh_token")
                        .build())
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(30));

        if (response == null || response.has("error")) {
            throw new IllegalStateException("Zoho token refresh failed: " + (response != null ? response.toString() : "empty response"));
        }

        String accessToken = response.path("access_token").asText(null);
        int expiresInSeconds = response.path("expires_in").asInt(3600);
        if (accessToken == null) {
            throw new IllegalStateException("Zoho token refresh response missing access_token: " + response);
        }

        Instant expiresAt = Instant.now().plusSeconds(Math.max(60, expiresInSeconds - 120));
        CachedToken token = new CachedToken(accessToken, expiresAt);
        cache.put(project.getId(), token);
        return accessToken;
    }
}
