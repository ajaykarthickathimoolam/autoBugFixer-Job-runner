package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.GptConnectionTestResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;

@Service
public class GptConnectionTestService {

    private final WebClient.Builder webClientBuilder;
    private final ObjectMapper mapper;

    public GptConnectionTestService(WebClient.Builder webClientBuilder, ObjectMapper mapper) {
        this.webClientBuilder = webClientBuilder;
        this.mapper = mapper;
    }

    public GptConnectionTestResponse test(String endpoint, String apiKey, String apiVersion, String deployment) {
        if (blank(endpoint) || blank(apiKey) || blank(deployment) || blank(apiVersion)) {
            return new GptConnectionTestResponse(false,
                    "Endpoint, API key, API version, and deployment name are required", null);
        }
        String base = endpoint.strip();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String url = base + "/openai/deployments/" + deployment.strip()
                + "/chat/completions?api-version=" + apiVersion.strip();
        ObjectNode body = mapper.createObjectNode();
        body.put("model", deployment.strip());
        ArrayNode messages = body.putArray("messages");
        ObjectNode user = messages.addObject();
        user.put("role", "user");
        user.put("content", "ping");
        body.put("max_completion_tokens", 1024);

        try {
            String raw = webClientBuilder.build()
                    .post()
                    .uri(url)
                    .header("api-key", apiKey.strip())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(write(body))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(30));
            JsonNode json = mapper.readTree(raw == null ? "{}" : raw);
            String model = json.path("model").asText(deployment);
            return new GptConnectionTestResponse(true, "Connected to Azure OpenAI", model);
        } catch (WebClientResponseException e) {
            return new GptConnectionTestResponse(false,
                    "HTTP " + e.getStatusCode().value() + ": " + trimBody(e.getResponseBodyAsString()), null);
        } catch (Exception e) {
            return new GptConnectionTestResponse(false, e.getMessage(), null);
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String trimBody(String body) {
        if (body == null) {
            return "";
        }
        String t = body.replaceAll("(?i)(api-key|sk-|Bearer )\\S+", "$1***");
        return t.length() > 400 ? t.substring(0, 400) + "…" : t;
    }

    private String write(ObjectNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
