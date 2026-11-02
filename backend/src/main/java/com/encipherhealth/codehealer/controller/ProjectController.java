package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.PrepareProjectRequest;
import com.encipherhealth.codehealer.dto.ProjectRequest;
import com.encipherhealth.codehealer.dto.ProjectResponse;
import com.encipherhealth.codehealer.dto.ServiceConfigRequest;
import com.encipherhealth.codehealer.dto.ServiceConfigResponse;
import com.encipherhealth.codehealer.dto.TaskServiceInfo;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.MissionType;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.ServiceConfig;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import com.encipherhealth.codehealer.service.EncryptionService;
import com.encipherhealth.codehealer.service.JobRunnerClient;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Slf4j
public class ProjectController {

    private final ProjectRepository projectRepository;
    private final EncryptionService encryptionService;
    private final JobRunnerClient jobRunnerClient;
    private final ExecutorService executor;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    @GetMapping
    public List<ProjectResponse> list() {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        List<String> allowedIds = projectAccessService.currentUserAllowedProjectIds();
        return projectRepository.findAll().stream()
                .filter(p -> allowedIds.contains(p.getId()))
                .map(this::toResponse)
                .toList();
    }

    @GetMapping("/{id}")
    public ProjectResponse get(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        return toResponse(findProjectOrThrow(id));
    }

    @PostMapping
    public ProjectResponse create(@Valid @RequestBody ProjectRequest request) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        Instant now = Instant.now();
        Project project = Project.builder()
                .name(request.getName())
                .architectureMd(request.getArchitectureMd())
                .zohoCliqWebhookUrlEncrypted(encryptionService.encrypt(blankToNull(request.getZohoCliqWebhookUrl())))
                .githubSshPrivateKeyEncrypted(encryptionService.encrypt(blankToNull(request.getGithubSshPrivateKey())))
                .githubPatEncrypted(encryptionService.encrypt(blankToNull(request.getGithubPat())))
                .services(toServiceConfigs(request.getServices()))
                .zohoTeamId(request.getZohoTeamId())
                .zohoProjectIdExternal(request.getZohoProjectIdExternal())
                .zohoOAuthClientIdEncrypted(encryptionService.encrypt(blankToNull(request.getZohoOAuthClientId())))
                .zohoOAuthClientSecretEncrypted(encryptionService.encrypt(blankToNull(request.getZohoOAuthClientSecret())))
                .zohoRefreshTokenEncrypted(encryptionService.encrypt(blankToNull(request.getZohoRefreshToken())))
                .agilePlatform(parsePlatform(request.getAgilePlatform()))
                .agentMode(parseAgentMode(request.getAgentMode()))
                .jiraBaseUrl(blankToNull(request.getJiraBaseUrl()))
                .jiraProjectKey(blankToNull(request.getJiraProjectKey()))
                .jiraEmail(blankToNull(request.getJiraEmail()))
                .jiraApiTokenEncrypted(encryptionService.encrypt(blankToNull(request.getJiraApiToken())))
                .jiraIssueTypes(blankToNull(request.getJiraIssueTypes()))
                .jiraWebhookSecretEncrypted(encryptionService.encrypt(blankToNull(request.getJiraWebhookSecret())))
                .createdAt(now)
                .updatedAt(now)
                .build();
        Project saved = projectRepository.save(project);
        prepareBaseClonesAsync(saved);
        return toResponse(saved);
    }

    @PutMapping("/{id}")
    public ProjectResponse update(@PathVariable String id, @Valid @RequestBody ProjectRequest request) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        Project project = findProjectOrThrow(id);
        project.setName(request.getName());
        project.setArchitectureMd(request.getArchitectureMd());
        if (request.getZohoCliqWebhookUrl() != null && !request.getZohoCliqWebhookUrl().isBlank()) {
            project.setZohoCliqWebhookUrlEncrypted(encryptionService.encrypt(request.getZohoCliqWebhookUrl()));
        }
        if (request.getGithubSshPrivateKey() != null && !request.getGithubSshPrivateKey().isBlank()) {
            project.setGithubSshPrivateKeyEncrypted(encryptionService.encrypt(request.getGithubSshPrivateKey()));
        }
        if (request.getGithubPat() != null && !request.getGithubPat().isBlank()) {
            project.setGithubPatEncrypted(encryptionService.encrypt(request.getGithubPat()));
        }
        project.setServices(toServiceConfigs(request.getServices()));
        project.setZohoTeamId(request.getZohoTeamId());
        project.setZohoProjectIdExternal(request.getZohoProjectIdExternal());
        if (request.getZohoOAuthClientId() != null && !request.getZohoOAuthClientId().isBlank()) {
            project.setZohoOAuthClientIdEncrypted(encryptionService.encrypt(request.getZohoOAuthClientId()));
        }
        if (request.getZohoOAuthClientSecret() != null && !request.getZohoOAuthClientSecret().isBlank()) {
            project.setZohoOAuthClientSecretEncrypted(encryptionService.encrypt(request.getZohoOAuthClientSecret()));
        }
        if (request.getZohoRefreshToken() != null && !request.getZohoRefreshToken().isBlank()) {
            project.setZohoRefreshTokenEncrypted(encryptionService.encrypt(request.getZohoRefreshToken()));
        }
        project.setAgilePlatform(parsePlatform(request.getAgilePlatform()));
        project.setAgentMode(parseAgentMode(request.getAgentMode()));
        project.setJiraBaseUrl(blankToNull(request.getJiraBaseUrl()));
        project.setJiraProjectKey(blankToNull(request.getJiraProjectKey()));
        project.setJiraEmail(blankToNull(request.getJiraEmail()));
        if (request.getJiraApiToken() != null && !request.getJiraApiToken().isBlank()) {
            project.setJiraApiTokenEncrypted(encryptionService.encrypt(request.getJiraApiToken()));
        }
        project.setJiraIssueTypes(blankToNull(request.getJiraIssueTypes()));
        if (request.getJiraWebhookSecret() != null && !request.getJiraWebhookSecret().isBlank()) {
            project.setJiraWebhookSecretEncrypted(encryptionService.encrypt(request.getJiraWebhookSecret()));
        }
        project.setUpdatedAt(Instant.now());
        Project saved = projectRepository.save(project);
        prepareBaseClonesAsync(saved);
        return toResponse(saved);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        projectRepository.deleteById(id);
    }

    @PostMapping("/{id}/services")
    public ProjectResponse addService(@PathVariable String id, @Valid @RequestBody ServiceConfigRequest request) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        Project project = findProjectOrThrow(id);
        ServiceConfig service = ServiceConfig.builder()
                .id(UUID.randomUUID().toString())
                .name(request.getName())
                .repoUrl(request.getRepoUrl())
                .baseBranch(request.getBaseBranch())
                .architectureMd(request.getArchitectureMd())
                .buildCommand(request.getBuildCommand())
                .testCommand(request.getTestCommand())
                .build();
        project.getServices().add(service);
        project.setUpdatedAt(Instant.now());
        return toResponse(projectRepository.save(project));
    }

    @PutMapping("/{id}/services/{serviceId}")
    public ProjectResponse updateService(@PathVariable String id, @PathVariable String serviceId,
                                          @Valid @RequestBody ServiceConfigRequest request) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        Project project = findProjectOrThrow(id);
        ServiceConfig service = project.getServices().stream()
                .filter(s -> s.getId().equals(serviceId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found"));
        service.setName(request.getName());
        service.setRepoUrl(request.getRepoUrl());
        service.setBaseBranch(request.getBaseBranch());
        service.setArchitectureMd(request.getArchitectureMd());
        service.setBuildCommand(request.getBuildCommand());
        service.setTestCommand(request.getTestCommand());
        project.setUpdatedAt(Instant.now());
        return toResponse(projectRepository.save(project));
    }

    @DeleteMapping("/{id}/services/{serviceId}")
    public ProjectResponse deleteService(@PathVariable String id, @PathVariable String serviceId) {
        pageAccessService.requireAccess(PageAccessService.PROJECTS);
        projectAccessService.requireAccess(id);
        Project project = findProjectOrThrow(id);
        project.getServices().removeIf(s -> s.getId().equals(serviceId));
        project.setUpdatedAt(Instant.now());
        return toResponse(projectRepository.save(project));
    }

    private Project findProjectOrThrow(String id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private List<ServiceConfig> toServiceConfigs(List<ServiceConfigRequest> requests) {
        List<ServiceConfig> result = new ArrayList<>();
        if (requests == null) {
            return result;
        }
        for (ServiceConfigRequest r : requests) {
            result.add(ServiceConfig.builder()
                    .id(r.getId() != null && !r.getId().isBlank() ? r.getId() : UUID.randomUUID().toString())
                    .name(r.getName())
                    .repoUrl(r.getRepoUrl())
                    .baseBranch(r.getBaseBranch())
                    .architectureMd(r.getArchitectureMd())
                    .buildCommand(r.getBuildCommand())
                    .testCommand(r.getTestCommand())
                    .build());
        }
        return result;
    }

    private ProjectResponse toResponse(Project project) {
        List<ServiceConfigResponse> services = project.getServices().stream()
                .map(s -> new ServiceConfigResponse(s.getId(), s.getName(), s.getRepoUrl(), s.getBaseBranch(),
                        s.getArchitectureMd(), s.getBuildCommand(), s.getTestCommand()))
                .toList();
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getArchitectureMd(),
                project.getZohoCliqWebhookUrlEncrypted() != null,
                project.getGithubSshPrivateKeyEncrypted() != null,
                project.getGithubPatEncrypted() != null,
                project.getZohoTeamId(),
                project.getZohoProjectIdExternal(),
                project.getZohoRefreshTokenEncrypted() != null,
                project.resolvedPlatform().name(),
                project.resolvedAgentMode().name(),
                project.getJiraBaseUrl(),
                project.getJiraProjectKey(),
                project.getJiraEmail(),
                project.getJiraApiTokenEncrypted() != null,
                project.getJiraIssueTypes(),
                project.getJiraWebhookSecretEncrypted() != null,
                project.getLastPolledAt(),
                services,
                project.getCreatedAt(),
                project.getUpdatedAt()
        );
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private AgilePlatform parsePlatform(String value) {
        if (value == null || value.isBlank()) {
            return AgilePlatform.ZOHO;
        }
        try {
            return AgilePlatform.valueOf(value.strip().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "agilePlatform must be ZOHO or JIRA");
        }
    }

    private MissionType parseAgentMode(String value) {
        if (value == null || value.isBlank()) {
            return MissionType.CODING;
        }
        try {
            return MissionType.valueOf(value.strip().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "agentMode must be CODING or L1_SUPPORT");
        }
    }

    /** Fire-and-forget: asks job-runner to warm every service's base clone right away, so the
     * first real ticket for this project doesn't pay the full clone cost. */
    private void prepareBaseClonesAsync(Project project) {
        if (project.getServices() == null || project.getServices().isEmpty()) {
            return;
        }
        String sshKey = encryptionService.decrypt(project.getGithubSshPrivateKeyEncrypted());
        if (sshKey == null || sshKey.isBlank()) {
            // No key configured yet - nothing job-runner could clone with; the first real task
            // will still work later once a key is set (ensureBaseClone runs lazily there too).
            return;
        }
        List<TaskServiceInfo> services = project.getServices().stream()
                .map(s -> new TaskServiceInfo(s.getId(), s.getName(), s.getRepoUrl(), s.getBaseBranch(),
                        s.getArchitectureMd(), s.getBuildCommand(), s.getTestCommand()))
                .toList();
        executor.submit(() -> {
            try {
                jobRunnerClient.prepareProject(new PrepareProjectRequest(project.getId(), services, sshKey));
            } catch (Exception e) {
                log.warn("Failed to trigger base-clone warm-up for project {}: {}", project.getId(), e.getMessage());
            }
        });
    }
}
