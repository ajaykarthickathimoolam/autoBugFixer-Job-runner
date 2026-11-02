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

    /** When true, Guard denies every agent action until an admin disarms it. */
    private Boolean killSwitchArmed;
    private String killSwitchReason;
    /** Human must approve the change plan (coding) or draft response (L1) before execution. */
    private Boolean requireChangePlanApproval;
    /** Build/test non-zero exit fails the job instead of continuing to a PR. */
    private Boolean testsMustPass;
    private Boolean securityScansEnabled;
    /** If identity/policy/audit cannot be evaluated, deny the action. */
    private Boolean failClosedEnabled;
    /** Allowlisted Guard actions. Empty/null means the built-in default set. */
    private java.util.List<String> allowedActions;
    private java.time.Instant lastBackupAt;

    public boolean isKillSwitchArmed() {
        return Boolean.TRUE.equals(killSwitchArmed);
    }

    public boolean isRequireChangePlanApproval() {
        return requireChangePlanApproval == null || requireChangePlanApproval;
    }

    public boolean isTestsMustPass() {
        return testsMustPass == null || testsMustPass;
    }

    public boolean isSecurityScansEnabled() {
        return securityScansEnabled == null || securityScansEnabled;
    }

    public boolean isFailClosedEnabled() {
        return failClosedEnabled == null || failClosedEnabled;
    }
}
