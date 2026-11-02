package com.encipherhealth.codehealer.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class ProjectRequest {
    @NotBlank
    private String name;
    private String architectureMd;

    /** Plaintext Zoho Cliq webhook URL. Omit/blank on update to keep the existing stored value. */
    private String zohoCliqWebhookUrl;
    /** Plaintext GitHub SSH private key (PEM). Omit/blank on update to keep the existing stored value. */
    private String githubSshPrivateKey;
    /** Plaintext GitHub Personal Access Token. Omit/blank on update to keep the existing stored value. */
    private String githubPat;
    /** When true on update, deletes the stored personal access token. Does not revoke it on GitHub. */
    private Boolean clearGithubPat;
    /** When true on update, deletes the stored SSH private key. Does not remove it from GitHub. */
    private Boolean clearGithubSshKey;
    private String githubAppId;
    private String githubAppInstallationId;
    /** Plaintext GitHub App private key. Omit/blank on update to keep the existing stored value. */
    private String githubAppPrivateKey;
    private Boolean clearGithubAppPrivateKey;

    private String zohoTeamId;
    private String zohoProjectIdExternal;
    /** Plaintext OAuth Self Client ID. Omit/blank on update to keep the existing stored value. */
    private String zohoOAuthClientId;
    /** Plaintext OAuth Self Client secret. Omit/blank on update to keep the existing stored value. */
    private String zohoOAuthClientSecret;
    /** Plaintext OAuth refresh token. Omit/blank on update to keep the existing stored value. */
    private String zohoRefreshToken;

    /** ZOHO (default) or JIRA. */
    private String agilePlatform;
    /** CODING (default) or L1_SUPPORT. */
    private String agentMode;

    private String jiraBaseUrl;
    private String jiraProjectKey;
    private String jiraEmail;
    /** Plaintext Jira API token. Omit/blank on update to keep the existing stored value. */
    private String jiraApiToken;
    private String jiraIssueTypes;
    /** Plaintext webhook doorbell secret. Omit/blank on update to keep the existing stored value. */
    private String jiraWebhookSecret;

    @Valid
    private List<ServiceConfigRequest> services = new ArrayList<>();
}
