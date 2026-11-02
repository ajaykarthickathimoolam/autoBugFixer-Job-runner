package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Optional;

@Service
@Slf4j
public class AzureOpenAiChatService {

    private final WebClient.Builder webClientBuilder;
    private final ObjectMapper mapper;
    private final SettingsRepository settingsRepository;
    private final EncryptionService encryptionService;

    public AzureOpenAiChatService(WebClient.Builder webClientBuilder,
                                   ObjectMapper mapper,
                                   SettingsRepository settingsRepository,
                                   EncryptionService encryptionService) {
        this.webClientBuilder = webClientBuilder;
        this.mapper = mapper;
        this.settingsRepository = settingsRepository;
        this.encryptionService = encryptionService;
    }

    public Optional<String> complete(String system, String user) {
        Settings settings = settingsRepository.findById("global").orElse(null);
        if (settings == null) {
            return Optional.empty();
        }
        String endpoint = settings.getAzureOpenAiEndpoint();
        String version = settings.getAzureOpenAiApiVersion();
        String deployment = settings.getAzureOpenAiDeployment();
        String apiKey = encryptionService.decrypt(settings.getAzureOpenAiApiKeyEncrypted());
        if (blank(endpoint) || blank(version) || blank(deployment) || blank(apiKey)) {
            return Optional.empty();
        }
        String base = endpoint.strip();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String url = base + "/openai/deployments/" + deployment.strip()
                + "/chat/completions?api-version=" + version.strip();
        ObjectNode body = mapper.createObjectNode();
        body.put("model", deployment.strip());
        ArrayNode messages = body.putArray("messages");
        if (!blank(system)) {
            ObjectNode sys = messages.addObject();
            sys.put("role", "system");
            sys.put("content", system);
        }
        ObjectNode userMsg = messages.addObject();
        userMsg.put("role", "user");
        userMsg.put("content", user);
        body.put("max_completion_tokens", 2048);
        try {
            String raw = webClientBuilder.build()
                    .post()
                    .uri(url)
                    .header("api-key", apiKey.strip())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(mapper.writeValueAsString(body))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(60));
            JsonNode json = mapper.readTree(raw == null ? "{}" : raw);
            String content = json.path("choices").path(0).path("message").path("content").asText("");
            return content.isBlank() ? Optional.empty() : Optional.of(content);
        } catch (Exception e) {
            log.warn("Azure OpenAI chat failed: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
