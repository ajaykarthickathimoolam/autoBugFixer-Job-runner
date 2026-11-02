package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.GuardDecision;
import com.encipherhealth.codehealer.dto.TaskRequest;
import com.encipherhealth.codehealer.dto.TaskServiceInfo;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Drives one job from CLONING onward: hands it to the job-runner, then blocks (holding the
 * per-service lock via the caller, {@link JobQueueService}) until the job-runner reports a
 * terminal event, or a generous timeout elapses.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JobOrchestrationService {

    private static final Duration JOB_TIMEOUT = Duration.ofMinutes(45);

    private final JobRepository jobRepository;
    private final JobRunnerClient jobRunnerClient;
    private final JobCompletionRegistry jobCompletionRegistry;
    private final SseBroadcastService sseBroadcastService;
    private final CliqNotificationService cliqNotificationService;
    private final EncryptionService encryptionService;
    private final SettingsRepository settingsRepository;
    private final GuardService guardService;
    private final SageService sageService;
    private final ExceptionQueueService exceptionQueueService;

    public void run(Job job, Project project) {
        jobCompletionRegistry.register(job.getId());

        try {
            String resumeFrom = job.getResumeFrom();
            GuardDecision guard = guardService.authorize(job, ResumePoint.guardAction(resumeFrom), "workforce");
            if (!guard.allowed()) {
                JobStatus halt = haltStatus(guard.haltStatus());
                job.transitionTo(halt);
                if (halt == JobStatus.FAILED) {
                    job.setFailureReason(guard.reason());
                    exceptionQueueService.open(job, "GUARD", guard.reason());
                } else if (halt == JobStatus.PAUSED) {
                    job.setPausedBy("guard");
                }
                job.setUpdatedAt(Instant.now());
                jobRepository.save(job);
                sseBroadcastService.broadcastJobUpdate(job);
                jobCompletionRegistry.complete(job.getId());
                return;
            }

            if (ResumePoint.marksCloning(resumeFrom)) {
                job.transitionTo(JobStatus.CLONING);
                job.setUpdatedAt(Instant.now());
                jobRepository.save(job);
                sseBroadcastService.broadcastJobUpdate(job);
            }

            jobRunnerClient.startTask(buildTaskRequest(job, project));
        } catch (Exception e) {
            log.error("Failed to dispatch job {} to job-runner", job.getId(), e);
            failJob(job, project, "Failed to start job-runner task: " + e.getMessage());
            jobCompletionRegistry.complete(job.getId());
            return;
        }

        // Loop rather than a single fixed wait: if the job is paused on AWAITING_INPUT (Claude
        // posted a clarifying question to the Zoho ticket and is waiting on a human reply), keep
        // holding the per-service lock indefinitely instead of failing the job on timeout - the
        // poller resumes it (via resumeAfterInput) once a reply is detected, and that resumption
        // eventually completes this same registered future.
        while (true) {
            boolean completed = jobCompletionRegistry.awaitCompletion(job.getId(), JOB_TIMEOUT);
            Job latest = jobRepository.findById(job.getId()).orElse(job);
            if (completed || latest.getStatus() == JobStatus.NOTIFIED || latest.getStatus() == JobStatus.FAILED
                    || latest.getStatus() == JobStatus.CANCELLED || latest.getStatus() == JobStatus.PAUSED
                    || latest.getStatus() == JobStatus.CLOSED || latest.getStatus() == JobStatus.ESCALATED) {
                return;
            }
            if (latest.getStatus() == JobStatus.AWAITING_INPUT || latest.getStatus() == JobStatus.AWAITING_APPROVAL) {
                jobCompletionRegistry.register(job.getId());
                continue;
            }
            failJob(latest, project, "Timed out waiting for job-runner to complete");
            return;
        }
    }

    /** Called by the poller, Jira webhook, or the job-detail form once a human answers. */
    public synchronized void resumeAfterInput(Job job, Project project, String humanAnswer) {
        Job latest = jobRepository.findById(job.getId()).orElse(job);
        if (latest.getStatus() != JobStatus.AWAITING_INPUT) {
            log.info("Ignoring clarification for job {} — status is {}", latest.getId(), latest.getStatus());
            return;
        }
        if (humanAnswer == null || humanAnswer.isBlank()) {
            log.info("Ignoring empty clarification for job {}", latest.getId());
            return;
        }
        String question = latest.getPendingQuestion();
        String augmentedDescription = (latest.getTicketDescription() != null ? latest.getTicketDescription() : "")
                + "\n\n---\nCodeHealer paused to ask a clarifying question on this ticket:\nQ: " + question
                + "\nA (from a human, via a reply on the ticket): " + humanAnswer.strip();
        latest.setTicketDescription(augmentedDescription);
        latest.setPendingQuestion(null);
        latest.transitionTo(JobStatus.CLONING);
        latest.setUpdatedAt(Instant.now());
        jobRepository.save(latest);
        sseBroadcastService.broadcastJobUpdate(latest);

        try {
            jobRunnerClient.startTask(buildTaskRequest(latest, project));
        } catch (Exception e) {
            log.error("Failed to resume job {} after human input", latest.getId(), e);
            failJob(latest, project, "Failed to resume job-runner task: " + e.getMessage());
            jobCompletionRegistry.complete(latest.getId());
        }
    }

    private void failJob(Job job, Project project, String reason) {
        job.transitionTo(JobStatus.FAILED);
        job.setFailureReason(reason);
        job.setUpdatedAt(Instant.now());
        jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
        if (project != null) {
            cliqNotificationService.notifyFailure(project, job);
        }
        exceptionQueueService.open(job, "JOB_FAILED", reason);
    }

    private TaskRequest buildTaskRequest(Job job, Project project) {
        List<TaskServiceInfo> services = project.getServices().stream()
                .filter(s -> job.getServiceIds().contains(s.getId()))
                .map(s -> new TaskServiceInfo(s.getId(), s.getName(), s.getRepoUrl(), s.getBaseBranch(),
                        s.getArchitectureMd(), s.getBuildCommand(), s.getTestCommand()))
                .toList();

        Settings settings = settingsRepository.findById("global").orElse(null);
        String clarificationLevel = settings != null && settings.getClarificationLevel() != null
                && !settings.getClarificationLevel().isBlank()
                ? settings.getClarificationLevel()
                : "MEDIUM";
        String llmProvider = settings != null && settings.getLlmProvider() != null
                && !settings.getLlmProvider().isBlank()
                ? settings.getLlmProvider().strip().toUpperCase()
                : "GPT";
        String claudeToken = settings == null ? null
                : encryptionService.decrypt(settings.getClaudeApiTokenEncrypted());
        String azureKey = settings == null ? null
                : encryptionService.decrypt(settings.getAzureOpenAiApiKeyEncrypted());

        boolean requireApproval = settings == null || settings.isRequireChangePlanApproval();
        boolean testsMustPass = settings == null || settings.isTestsMustPass();
        boolean scansEnabled = settings == null || settings.isSecurityScansEnabled();
        boolean execute = job.getApprovedBy() != null && job.getChangePlan() != null && !job.getChangePlan().isBlank();
        String phase = requireApproval && !execute ? "PLAN" : "EXECUTE";
        String sageContext = sageService.formatForPrompt(
                sageService.retrieve(job.getProjectId(),
                        (job.getTicketTitle() == null ? "" : job.getTicketTitle()) + " "
                                + (job.getTicketDescription() == null ? "" : job.getTicketDescription()),
                        5));

        return new TaskRequest(
                job.getId(),
                job.getTicketId(),
                job.getTicketTitle(),
                job.getTicketDescription(),
                project.getId(),
                project.getName(),
                project.getArchitectureMd(),
                services,
                encryptionService.decrypt(project.getGithubSshPrivateKeyEncrypted()),
                encryptionService.decrypt(project.getGithubPatEncrypted()),
                blankToNull(claudeToken),
                clarificationLevel,
                llmProvider,
                settings == null ? null : blankToNull(settings.getAzureOpenAiEndpoint()),
                blankToNull(azureKey),
                settings == null ? null : blankToNull(settings.getAzureOpenAiApiVersion()),
                settings == null ? null : blankToNull(settings.getAzureOpenAiDeployment()),
                phase,
                job.getChangePlan(),
                requireApproval,
                testsMustPass,
                scansEnabled,
                sageContext,
                job.getResumeFrom(),
                job.getSecurityScanSummary()
        );
    }

    private static JobStatus haltStatus(String value) {
        try {
            return value == null ? JobStatus.FAILED : JobStatus.valueOf(value);
        } catch (Exception e) {
            return JobStatus.FAILED;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
