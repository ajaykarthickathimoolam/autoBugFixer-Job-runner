package com.encipherhealth.codehealer.dto;

import lombok.Data;

@Data
public class SettingsRequest {
    /** Plaintext Claude API token. Omit/blank to keep the existing stored value. */
    private String claudeApiToken;
    private Integer maxConcurrentJobs;
    /** How often (in seconds) to poll Zoho Sprints or Jira for new tickets. */
    private Integer zohoPollIntervalSeconds;
    /** NONE, LOW, MEDIUM, or HIGH - how readily the fixer should ask a clarifying question instead of guessing. */
    private String clarificationLevel;

    /** CLAUDE or GPT. */
    private String llmProvider;
    private String azureOpenAiEndpoint;
    /** Plaintext Azure OpenAI API key. Omit/blank to keep the existing stored value. */
    private String azureOpenAiApiKey;
    private String azureOpenAiApiVersion;
    private String azureOpenAiDeployment;

    private Boolean killSwitchArmed;
    private String killSwitchReason;
    private Boolean requireChangePlanApproval;
    private Boolean testsMustPass;
    private Boolean securityScansEnabled;
    private Boolean failClosedEnabled;
}
