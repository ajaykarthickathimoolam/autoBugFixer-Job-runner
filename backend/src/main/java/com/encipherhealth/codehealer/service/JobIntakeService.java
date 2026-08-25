package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
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

/**
 * Entry point for a new ticket found by the poller: creates the job with every one of the
 * project's services in scope (the fixer sees every service's checkout in one task and decides
 * which one(s) to change), then hands it to {@link JobQueueService} for serialized,
 * concurrency-capped execution.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JobIntakeService {

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final JobQueueService jobQueueService;
    private final SseBroadcastService sseBroadcastService;

    /** Creates the job, broadcasts it, and hands it straight to the queue. */
    public Job ingestNewTicket(Project project, String ticketId, String title, String description,
                                String creatorName, String assigneeName, String zohoItemContainerId) {
        Instant now = Instant.now();
        List<String> serviceIds = project.getServices().stream().map(ServiceConfig::getId).toList();

        Job job = Job.builder()
                .ticketId(ticketId)
                .ticketTitle(title)
                .ticketDescription(description)
                .creatorName(creatorName)
                .assigneeName(assigneeName)
                .zohoItemContainerId(zohoItemContainerId)
                .projectId(project.getId())
                .serviceIds(serviceIds)
                .status(JobStatus.RECEIVED)
                .statusHistory(new ArrayList<>(List.of(
                        JobStatusEvent.builder().status(JobStatus.RECEIVED).timestamp(now).build())))
                .logs(new ArrayList<>())
                .createdAt(now)
                .updatedAt(now)
                .build();
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        jobQueueService.submit(job, project);
        return job;
    }

    /**
     * Requeues a FAILED job on the same ticket. The poller will not pick the ticket up again
     * because a job already exists for that project+ticketId, so this is the only way to
     * recover from a transient failure (job-runner down, clone error, etc.).
     */
    public Job retryFailedJob(String jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        if (job.getStatus() != JobStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only failed jobs can be retried (current status: " + job.getStatus() + ")");
        }
        Project project = projectRepository.findById(job.getProjectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));

        List<String> serviceIds = project.getServices().stream().map(ServiceConfig::getId).toList();
        job.setServiceIds(serviceIds);
        job.setFailureReason(null);
        job.setPendingQuestion(null);
        job.transitionTo(JobStatus.RECEIVED);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);

        log.info("Retrying failed job {} for ticket {}", job.getId(), job.getTicketId());
        jobQueueService.submit(job, project);
        return job;
    }
}
