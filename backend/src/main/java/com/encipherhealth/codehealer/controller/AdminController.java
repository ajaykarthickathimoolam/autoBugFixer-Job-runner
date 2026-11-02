package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.GptConnectionTestRequest;
import com.encipherhealth.codehealer.dto.GptConnectionTestResponse;
import com.encipherhealth.codehealer.dto.SettingsRequest;
import com.encipherhealth.codehealer.dto.SettingsResponse;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.service.EncryptionService;
import com.encipherhealth.codehealer.service.GptConnectionTestService;
import com.encipherhealth.codehealer.service.JobQueueService;
import com.encipherhealth.codehealer.service.TraceService;
import com.encipherhealth.codehealer.service.ticket.TicketPollerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/settings")
@RequiredArgsConstructor
public class AdminController {

    private static final String SETTINGS_ID = "global";
    private static final int DEFAULT_ZOHO_POLL_INTERVAL_SECONDS = 60;
    private static final String DEFAULT_CLARIFICATION_LEVEL = "MEDIUM";
    private static final String DEFAULT_LLM_PROVIDER = "GPT";
    private static final String DEFAULT_AZURE_API_VERSION = "2025-01-01-preview";
    private static final java.util.Set<String> VALID_CLARIFICATION_LEVELS = java.util.Set.of("NONE", "LOW", "MEDIUM", "HIGH");
    private static final java.util.Set<String> VALID_LLM_PROVIDERS = java.util.Set.of("CLAUDE", "GPT");

    private final SettingsRepository settingsRepository;
    private final EncryptionService encryptionService;
    private final JobQueueService jobQueueService;
    private final TicketPollerService ticketPollerService;
    private final PageAccessService pageAccessService;
    private final GptConnectionTestService gptConnectionTestService;
    private final TraceService traceService;

    @GetMapping
    public SettingsResponse get() {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        return toResponse(currentOrDefault());
    }

    @PutMapping
    public SettingsResponse update(@RequestBody SettingsRequest request) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        Settings settings = currentOrDefault();
        if (request.getClaudeApiToken() != null && !request.getClaudeApiToken().isBlank()) {
            settings.setClaudeApiTokenEncrypted(encryptionService.encrypt(request.getClaudeApiToken()));
        }
        if (request.getMaxConcurrentJobs() != null && request.getMaxConcurrentJobs() > 0) {
            settings.setMaxConcurrentJobs(request.getMaxConcurrentJobs());
            jobQueueService.setMaxConcurrentJobs(request.getMaxConcurrentJobs());
        }
        if (request.getZohoPollIntervalSeconds() != null && request.getZohoPollIntervalSeconds() > 0) {
            settings.setZohoPollIntervalSeconds(request.getZohoPollIntervalSeconds());
            ticketPollerService.setPollIntervalSeconds(request.getZohoPollIntervalSeconds());
        }
        if (request.getClarificationLevel() != null && VALID_CLARIFICATION_LEVELS.contains(request.getClarificationLevel().toUpperCase())) {
            settings.setClarificationLevel(request.getClarificationLevel().toUpperCase());
        }
        if (request.getLlmProvider() != null && !request.getLlmProvider().isBlank()) {
            String provider = request.getLlmProvider().strip().toUpperCase();
            if (!VALID_LLM_PROVIDERS.contains(provider)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "llmProvider must be CLAUDE or GPT");
            }
            settings.setLlmProvider(provider);
        }
        if (request.getAzureOpenAiEndpoint() != null && !request.getAzureOpenAiEndpoint().isBlank()) {
            settings.setAzureOpenAiEndpoint(request.getAzureOpenAiEndpoint().strip());
        }
        if (request.getAzureOpenAiApiKey() != null && !request.getAzureOpenAiApiKey().isBlank()) {
            settings.setAzureOpenAiApiKeyEncrypted(encryptionService.encrypt(request.getAzureOpenAiApiKey()));
        }
        if (request.getAzureOpenAiApiVersion() != null && !request.getAzureOpenAiApiVersion().isBlank()) {
            settings.setAzureOpenAiApiVersion(request.getAzureOpenAiApiVersion().strip());
        }
        if (request.getAzureOpenAiDeployment() != null && !request.getAzureOpenAiDeployment().isBlank()) {
            settings.setAzureOpenAiDeployment(request.getAzureOpenAiDeployment().strip());
        }
        if (request.getKillSwitchArmed() != null) {
            boolean wasArmed = settings.isKillSwitchArmed();
            settings.setKillSwitchArmed(request.getKillSwitchArmed());
            if (request.getKillSwitchReason() != null) {
                settings.setKillSwitchReason(request.getKillSwitchReason());
            }
            if (request.getKillSwitchArmed() && !wasArmed) {
                traceService.record(null, null, "GUARD", "admin", "KILL_SWITCH_ARM", settings.getKillSwitchReason());
            } else if (!request.getKillSwitchArmed() && wasArmed) {
                settings.setKillSwitchReason(null);
                traceService.record(null, null, "GUARD", "admin", "KILL_SWITCH_DISARM", null);
            }
        }
        if (request.getRequireChangePlanApproval() != null) {
            settings.setRequireChangePlanApproval(request.getRequireChangePlanApproval());
        }
        if (request.getTestsMustPass() != null) {
            settings.setTestsMustPass(request.getTestsMustPass());
        }
        if (request.getSecurityScansEnabled() != null) {
            settings.setSecurityScansEnabled(request.getSecurityScansEnabled());
        }
        if (request.getFailClosedEnabled() != null) {
            settings.setFailClosedEnabled(request.getFailClosedEnabled());
        }
        settingsRepository.save(settings);
        return toResponse(settings);
    }

    @PostMapping("/gpt/test-connection")
    public GptConnectionTestResponse testGpt(@RequestBody GptConnectionTestRequest request) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        Settings settings = currentOrDefault();
        String endpoint = firstNonBlank(request.endpoint(), settings.getAzureOpenAiEndpoint());
        String version = firstNonBlank(request.apiVersion(), settings.getAzureOpenAiApiVersion(), DEFAULT_AZURE_API_VERSION);
        String deployment = firstNonBlank(request.deployment(), settings.getAzureOpenAiDeployment());
        String apiKey = firstNonBlank(request.apiKey(), encryptionService.decrypt(settings.getAzureOpenAiApiKeyEncrypted()));
        return gptConnectionTestService.test(endpoint, apiKey, version, deployment);
    }

    private Settings currentOrDefault() {
        return settingsRepository.findById(SETTINGS_ID)
                .orElseGet(() -> Settings.builder()
                        .id(SETTINGS_ID)
                        .maxConcurrentJobs(5)
                        .zohoPollIntervalSeconds(DEFAULT_ZOHO_POLL_INTERVAL_SECONDS)
                        .clarificationLevel(DEFAULT_CLARIFICATION_LEVEL)
                        .llmProvider(DEFAULT_LLM_PROVIDER)
                        .azureOpenAiApiVersion(DEFAULT_AZURE_API_VERSION)
                        .killSwitchArmed(false)
                        .requireChangePlanApproval(true)
                        .testsMustPass(true)
                        .securityScansEnabled(true)
                        .failClosedEnabled(true)
                        .build());
    }

    private SettingsResponse toResponse(Settings settings) {
        int pollInterval = settings.getZohoPollIntervalSeconds() > 0
                ? settings.getZohoPollIntervalSeconds()
                : DEFAULT_ZOHO_POLL_INTERVAL_SECONDS;
        String clarificationLevel = settings.getClarificationLevel() != null
                ? settings.getClarificationLevel()
                : DEFAULT_CLARIFICATION_LEVEL;
        String llmProvider = settings.getLlmProvider() != null && !settings.getLlmProvider().isBlank()
                ? settings.getLlmProvider()
                : DEFAULT_LLM_PROVIDER;
        String apiVersion = settings.getAzureOpenAiApiVersion() != null && !settings.getAzureOpenAiApiVersion().isBlank()
                ? settings.getAzureOpenAiApiVersion()
                : DEFAULT_AZURE_API_VERSION;
        return new SettingsResponse(
                settings.getClaudeApiTokenEncrypted() != null,
                settings.getMaxConcurrentJobs(),
                pollInterval,
                clarificationLevel,
                llmProvider,
                settings.getAzureOpenAiApiKeyEncrypted() != null,
                settings.getAzureOpenAiEndpoint(),
                apiVersion,
                settings.getAzureOpenAiDeployment(),
                settings.isKillSwitchArmed(),
                settings.getKillSwitchReason(),
                settings.isRequireChangePlanApproval(),
                settings.isTestsMustPass(),
                settings.isSecurityScansEnabled(),
                settings.isFailClosedEnabled());
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.strip();
            }
        }
        return null;
    }
}
