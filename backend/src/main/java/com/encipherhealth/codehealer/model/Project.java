package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "projects")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Project {
    @Id
    private String id;
    private String name;
    private String architectureMd;
    private String zohoCliqWebhookUrlEncrypted;
    private String githubSshPrivateKeyEncrypted;
    private String githubPatEncrypted;
    @Builder.Default
    private List<ServiceConfig> services = new ArrayList<>();

    /** Which ticket host this project uses. Null in existing documents means ZOHO. */
    @Builder.Default
    private AgilePlatform agilePlatform = AgilePlatform.ZOHO;

    /** CODING (default) or L1_SUPPORT. Null in existing documents means CODING. */
    @Builder.Default
    private MissionType agentMode = MissionType.CODING;

    /** Zoho Sprints Team ID - CodeHealer polls this project's board for new bug tickets. */
    private String zohoTeamId;
    /** Zoho Sprints' own Project ID (distinct from our internal id). */
    private String zohoProjectIdExternal;
    private String zohoOAuthClientIdEncrypted;
    private String zohoOAuthClientSecretEncrypted;
    private String zohoRefreshTokenEncrypted;

    /** Jira Cloud site, e.g. https://yourorg.atlassian.net */
    private String jiraBaseUrl;
    /** Jira project key, e.g. PAY */
    private String jiraProjectKey;
    private String jiraEmail;
    private String jiraApiTokenEncrypted;
    /** Comma-separated issue types to ingest. Blank defaults to Bug. */
    private String jiraIssueTypes;
    /** Shared secret for this project's Jira webhook doorbell. */
    private String jiraWebhookSecretEncrypted;

    /** Cursor: only items created after this are considered new by the poller. */
    private Instant lastPolledAt;

    public AgilePlatform resolvedPlatform() {
        return agilePlatform != null ? agilePlatform : AgilePlatform.ZOHO;
    }

    public MissionType resolvedAgentMode() {
        return agentMode != null ? agentMode : MissionType.CODING;
    }

    private Instant createdAt;
    private Instant updatedAt;
}
