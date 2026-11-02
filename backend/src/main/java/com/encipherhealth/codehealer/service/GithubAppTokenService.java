package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Project;
import com.fasterxml.jackson.databind.JsonNode;
import io.jsonwebtoken.Jwts;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.security.PrivateKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Mints a short-lived GitHub App installation token. A pasted personal access token is the fallback
 * when no App is configured.
 */
@Service
@RequiredArgsConstructor
public class GithubAppTokenService {

    private final WebClient.Builder webClientBuilder;
    private final EncryptionService encryptionService;

    public boolean configured(Project project) {
        return project != null
                && notBlank(project.getGithubAppId())
                && notBlank(project.getGithubAppInstallationId())
                && notBlank(project.getGithubAppPrivateKeyEncrypted());
    }

    public String accessToken(Project project) {
        if (configured(project)) {
            return installationToken(project);
        }
        return encryptionService.decrypt(project.getGithubPatEncrypted());
    }

    public String installationToken(Project project) {
        String pem = encryptionService.decrypt(project.getGithubAppPrivateKeyEncrypted());
        PrivateKey key = GithubAppKeyParser.parse(pem);
        String jwt = Jwts.builder()
                .issuer(project.getGithubAppId().trim())
                .issuedAt(Date.from(Instant.now().minusSeconds(60)))
                .expiration(Date.from(Instant.now().plusSeconds(9 * 60)))
                .signWith(key, Jwts.SIG.RS256)
                .compact();
        JsonNode body = webClientBuilder.build()
                .post()
                .uri("https://api.github.com/app/installations/{id}/access_tokens",
                        project.getGithubAppInstallationId().trim())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwt)
                .header(HttpHeaders.ACCEPT, "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(20));
        String token = body == null ? "" : body.path("token").asText("");
        if (token.isBlank()) {
            throw new IllegalStateException("GitHub did not return an installation token");
        }
        return token;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
