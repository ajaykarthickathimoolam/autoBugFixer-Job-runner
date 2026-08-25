package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Settings {
    @Id
    private String id;
    private String claudeApiTokenEncrypted;
    private int maxConcurrentJobs;
    private int zohoPollIntervalSeconds;
    /** How readily the fixer should pause and ask a clarifying question instead of guessing: NONE, LOW, MEDIUM, HIGH. */
    private String clarificationLevel;

    /** CLAUDE (Claude Code CLI) or GPT (Azure OpenAI chat + tools). */
    private String llmProvider;
    private String azureOpenAiEndpoint;
    private String azureOpenAiApiKeyEncrypted;
    private String azureOpenAiApiVersion;
    private String azureOpenAiDeployment;
}
