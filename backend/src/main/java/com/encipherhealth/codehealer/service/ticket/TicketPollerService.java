package com.encipherhealth.codehealer.service.ticket;

import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import com.encipherhealth.codehealer.service.JobIntakeService;
import com.encipherhealth.codehealer.service.JobOrchestrationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.TriggerContext;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Shared poll loop for every project's ticket platform (Zoho or Jira).
 */
@Component
@Slf4j
public class TicketPollerService implements SchedulingConfigurer {

    private static final int DEFAULT_POLL_INTERVAL_SECONDS = 60;
    private static final int MIN_POLL_INTERVAL_SECONDS = 15;

    private final ProjectRepository projectRepository;
    private final JobRepository jobRepository;
    private final JobIntakeService jobIntakeService;
    private final JobOrchestrationService jobOrchestrationService;
    private final TicketPlatformRegistry platformRegistry;

    private volatile int pollIntervalSeconds;

    public TicketPollerService(ProjectRepository projectRepository,
                               JobRepository jobRepository,
                               JobIntakeService jobIntakeService,
                               JobOrchestrationService jobOrchestrationService,
                               TicketPlatformRegistry platformRegistry,
                               SettingsRepository settingsRepository) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
        this.jobIntakeService = jobIntakeService;
        this.jobOrchestrationService = jobOrchestrationService;
        this.platformRegistry = platformRegistry;
        this.pollIntervalSeconds = settingsRepository.findById("global")
                .map(Settings::getZohoPollIntervalSeconds)
                .filter(s -> s >= MIN_POLL_INTERVAL_SECONDS)
                .orElse(DEFAULT_POLL_INTERVAL_SECONDS);
    }

    public void setPollIntervalSeconds(int seconds) {
        this.pollIntervalSeconds = Math.max(MIN_POLL_INTERVAL_SECONDS, seconds);
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        taskRegistrar.addTriggerTask(this::pollAllProjects, this::nextExecution);
    }

    private Instant nextExecution(TriggerContext triggerContext) {
        Instant last = triggerContext.lastCompletion();
        Instant base = last != null ? last : Instant.now();
        return base.plusSeconds(pollIntervalSeconds);
    }

    public void pollAllProjects() {
        List<Project> projects = projectRepository.findAll();
        for (Project project : projects) {
            try {
                pollProject(project);
            } catch (Exception e) {
                log.error("Ticket poll failed for project {} ({}) on {}",
                        project.getId(), project.getName(), project.resolvedPlatform(), e);
            }
        }
        checkAwaitingInputJobs();
    }

    public void ingestDiscoveredTicket(Project project, NormalizedTicket ticket) {
        if (ticket == null || ticket.ticketId() == null || ticket.ticketId().isBlank()) {
            return;
        }
        if (jobRepository.existsByProjectIdAndTicketId(project.getId(), ticket.ticketId())) {
            return;
        }
        jobIntakeService.ingestNewTicket(
                project,
                ticket.ticketId(),
                ticket.title(),
                ticket.description(),
                ticket.creatorName(),
                ticket.assigneeName(),
                ticket.containerId());
    }

    private void pollProject(Project project) {
        TicketPlatform platform = platformRegistry.forProject(project);
        if (!platform.isConfigured(project)) {
            return;
        }
        Instant pollStartTime = Instant.now();
        Instant cursor = project.getLastPolledAt();
        List<NormalizedTicket> tickets = platform.discoverNewTickets(project, cursor);
        for (NormalizedTicket ticket : tickets) {
            ingestDiscoveredTicket(project, ticket);
        }
        project.setLastPolledAt(pollStartTime);
        projectRepository.save(project);
    }

    private void checkAwaitingInputJobs() {
        for (Job job : jobRepository.findByStatus(JobStatus.AWAITING_INPUT)) {
            try {
                checkAwaitingInputJob(job);
            } catch (Exception e) {
                log.error("Failed to check for a reply on paused job {}", job.getId(), e);
            }
        }
    }

    private void checkAwaitingInputJob(Job job) {
        Project project = projectRepository.findById(job.getProjectId()).orElse(null);
        if (project == null) {
            return;
        }
        Instant askedAt = job.getStatusHistory().stream()
                .filter(e -> e.getStatus() == JobStatus.AWAITING_INPUT)
                .map(JobStatusEvent::getTimestamp)
                .max(Instant::compareTo)
                .orElse(job.getUpdatedAt());
        TicketPlatform platform = platformRegistry.forProject(project);
        Optional<String> reply = platform.findReplyAfter(project, job, askedAt);
        reply.ifPresent(answer -> {
            log.info("Detected a human reply on the ticket for paused job {} - resuming", job.getId());
            jobOrchestrationService.resumeAfterInput(job, project, answer);
        });
    }
}
