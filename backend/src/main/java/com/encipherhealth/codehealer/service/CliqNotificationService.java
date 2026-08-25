package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.Project;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class CliqNotificationService {

    private final WebClient.Builder webClientBuilder;
    private final EncryptionService encryptionService;

    public void notifyPrCreated(Project project, Job job) {
        send(project, String.format("✅ CodeHealer opened a fix PR for ticket *%s*: %s",
                job.getTicketId(), job.getPrUrl()));
    }

    public void notifyFailure(Project project, Job job) {
        send(project, String.format("❌ CodeHealer failed to fix ticket *%s*: %s",
                job.getTicketId(), job.getFailureReason() != null ? job.getFailureReason() : "unknown error"));
    }

    private void send(Project project, String message) {
        String webhookUrl = encryptionService.decrypt(project.getZohoCliqWebhookUrlEncrypted());
        if (webhookUrl == null || webhookUrl.isBlank()) {
            log.warn("Project {} has no Cliq webhook configured; skipping notification", project.getId());
            return;
        }
        try {
            webClientBuilder.build().post()
                    .uri(webhookUrl)
                    .bodyValue(Map.of("text", message))
                    .retrieve()
                    .toBodilessEntity()
                    .block(Duration.ofSeconds(10));
        } catch (Exception e) {
            log.warn("Failed to post Cliq notification for project {}: {}", project.getId(), e.getMessage());
        }
    }
}
