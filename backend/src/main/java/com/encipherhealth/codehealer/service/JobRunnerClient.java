package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.PrepareProjectRequest;
import com.encipherhealth.codehealer.dto.TaskRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;

@Component
public class JobRunnerClient {

    private final WebClient webClient;
    private final String sharedSecret;

    public JobRunnerClient(WebClient.Builder builder,
                            @Value("${app.job-runner.base-url}") String baseUrl,
                            @Value("${app.job-runner.shared-secret}") String sharedSecret) {
        this.webClient = builder.baseUrl(baseUrl).build();
        this.sharedSecret = sharedSecret;
    }

    /**
     * Fires off a fix task. The job-runner accepts and works the task asynchronously,
     * reporting progress back to the backend's internal API as it goes.
     */
    public void startTask(TaskRequest request) {
        webClient.post()
                .uri("/tasks")
                .header("X-Internal-Secret", sharedSecret)
                .bodyValue(request)
                .retrieve()
                .toBodilessEntity()
                .block(Duration.ofSeconds(15));
    }

    /** Fire-and-forget: warms every service's base clone so the first real ticket isn't slower. */
    public void prepareProject(PrepareProjectRequest request) {
        webClient.post()
                .uri("/projects/prepare")
                .header("X-Internal-Secret", sharedSecret)
                .bodyValue(request)
                .retrieve()
                .toBodilessEntity()
                .block(Duration.ofSeconds(15));
    }

    public void abortTask(String jobId) {
        webClient.post()
                .uri("/tasks/{jobId}/abort", jobId)
                .header("X-Internal-Secret", sharedSecret)
                .retrieve()
                .toBodilessEntity()
                .block(Duration.ofSeconds(10));
    }
}
