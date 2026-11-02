package com.encipherhealth.codehealer.dto;

public record SettingsResponse(
        boolean hasClaudeApiToken,
        int maxConcurrentJobs,
        int zohoPollIntervalSeconds,
        String clarificationLevel,
        String llmProvider,
        boolean hasAzureOpenAiApiKey,
        String azureOpenAiEndpoint,
        String azureOpenAiApiVersion,
        String azureOpenAiDeployment,
        boolean killSwitchArmed,
        String killSwitchReason,
        boolean requireChangePlanApproval,
        boolean testsMustPass,
        boolean securityScansEnabled,
        boolean failClosedEnabled
) {
}
