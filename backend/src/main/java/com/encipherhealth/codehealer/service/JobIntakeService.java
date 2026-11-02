package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
import com.encipherhealth.codehealer.model.MissionType;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.ServiceConfig;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Entry point for a new ticket found by the poller: creates the job, then hands it to
 * {@link MissionControlService} which routes Coding jobs to the runner and L1 jobs to Sage.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JobIntakeService {

    private static final Set<JobStatus> RETRYABLE = Set.of(JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.ESCALATED);

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final MissionControlService missionControlService;
    private final SseBroadcastService sseBroadcastService;
    private final GuardService guardService;

    /** Creates the job, broadcasts it, and hands it straight to dispatch. */
    public Job ingestNewTicket(Project project, String ticketId, String title, String description,
                                String creatorName, String assigneeName, String zohoItemContainerId) {
        Instant now = Instant.now();
        List<String> serviceIds = project.getServices().stream().map(ServiceConfig::getId).toList();
        MissionType missionType = project.resolvedAgentMode();

        Job job = Job.builder()
                .ticketId(ticketId)
                .ticketTitle(title)
                .ticketDescription(description)
                .creatorName(creatorName)
                .assigneeName(assigneeName)
                .zohoItemContainerId(zohoItemContainerId)
                .projectId(project.getId())
                .serviceIds(serviceIds)
                .missionType(missionType)
                .status(JobStatus.RECEIVED)
                .statusHistory(new ArrayList<>(List.of(
                        JobStatusEvent.builder().status(JobStatus.RECEIVED).timestamp(now).build())))
                .logs(new ArrayList<>())
                .createdAt(now)
                .updatedAt(now)
                .build();
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        if (guardService.isKillSwitchArmed()) {
            job.transitionTo(JobStatus.PAUSED);
            job.setPausedBy("guard");
            job.setUpdatedAt(Instant.now());
            job = jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            return job;
        }

        missionControlService.dispatch(job);
        return job;
    }

    /**
     * Requeues a FAILED/CANCELLED/ESCALATED job on the same ticket. The poller will not pick the
     * ticket up again because a job already exists for that project+ticketId, so this is the
     * only way to recover from a transient failure (job-runner down, clone error, etc.).
     */
    public Job retryFailedJob(String jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        if (!RETRYABLE.contains(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only failed, cancelled, or escalated jobs can be retried (current status: " + job.getStatus() + ")");
        }
        if (guardService.isKillSwitchArmed()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Kill switch is armed");
        }
        Project project = projectRepository.findById(job.getProjectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));

        List<String> serviceIds = project.getServices().stream().map(ServiceConfig::getId).toList();
        job.setServiceIds(serviceIds);
        String resumeFrom = ResumePoint.forFailedJob(job);
        job.setResumeFrom(resumeFrom);
        job.setFailureReason(null);
        job.setPendingQuestion(null);
        job.setCancelledBy(null);
        job.setCancellationReason(null);
        job.transitionTo(JobStatus.RECEIVED);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        log.info("Retrying job {} for ticket {} from {}", job.getId(), job.getTicketId(),
                resumeFrom == null ? "the start" : resumeFrom);
        missionControlService.dispatch(job);
        return job;
    }
}
