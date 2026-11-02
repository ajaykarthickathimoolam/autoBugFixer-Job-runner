package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.GuardDecision;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.MissionType;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ExecutorService;

@Service
@RequiredArgsConstructor
public class MissionControlService {

    private static final Set<JobStatus> PAUSABLE = Set.of(
            JobStatus.RECEIVED, JobStatus.ANALYZING, JobStatus.CLONING, JobStatus.FIXING,
            JobStatus.VERIFYING, JobStatus.SCANNING, JobStatus.AWAITING_INPUT, JobStatus.AWAITING_APPROVAL
    );
    private static final Set<JobStatus> CANCELLABLE = Set.of(
            JobStatus.RECEIVED, JobStatus.ANALYZING, JobStatus.CLONING, JobStatus.FIXING,
            JobStatus.VERIFYING, JobStatus.SCANNING, JobStatus.AWAITING_INPUT, JobStatus.AWAITING_APPROVAL,
            JobStatus.PAUSED
    );

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final JobQueueService jobQueueService;
    private final JobRunnerClient jobRunnerClient;
    private final JobCompletionRegistry jobCompletionRegistry;
    private final GuardService guardService;
    private final TraceService traceService;
    private final SseBroadcastService sseBroadcastService;
    private final L1SupportService l1SupportService;
    private final SageService sageService;
    private final JobOrchestrationService jobOrchestrationService;
    private final ExecutorService executor;

    public Job pause(String jobId) {
        Job job = requireJob(jobId);
        if (!PAUSABLE.contains(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Job cannot be paused from " + job.getStatus());
        }
        String actor = currentUser();
        job.transitionTo(JobStatus.PAUSED);
        job.setPausedBy(actor);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        jobCompletionRegistry.complete(jobId);
        abortRunnerQuietly(jobId);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "PAUSE", "Operator pause");
        return job;
    }

    public Job submitClarification(String jobId, String answer) {
        Job job = requireJob(jobId);
        if (job.getStatus() != JobStatus.AWAITING_INPUT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Job is not waiting for input");
        }
        if (answer == null || answer.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Answer is required");
        }
        Project project = projectRepository.findById(job.getProjectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        jobOrchestrationService.resumeAfterInput(job, project, answer.strip());
        return jobRepository.findById(jobId).orElse(job);
    }

    public Job resume(String jobId) {
        Job job = requireJob(jobId);
        if (job.getStatus() != JobStatus.PAUSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only paused jobs can be resumed");
        }
        GuardDecision decision = guardService.authorizeResume(job, job.getMissionType() == MissionType.L1_SUPPORT
                ? "L1_INVESTIGATE" : "CLONE", currentUser());
        if (!decision.allowed()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, decision.reason());
        }
        String actor = currentUser();
        job.setPausedBy(null);
        job.transitionTo(JobStatus.RECEIVED);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "RESUME", "Operator resume");
        dispatch(job);
        return job;
    }

    public Job cancel(String jobId, String reason) {
        Job job = requireJob(jobId);
        if (!CANCELLABLE.contains(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Job cannot be cancelled from " + job.getStatus());
        }
        String actor = currentUser();
        job.transitionTo(JobStatus.CANCELLED);
        job.setCancelledBy(actor);
        job.setCancellationReason(reason);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        jobCompletionRegistry.complete(jobId);
        abortRunnerQuietly(jobId);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "CANCEL", reason);
        return job;
    }

    public Job approve(String jobId) {
        Job job = requireJob(jobId);
        if (job.getStatus() != JobStatus.AWAITING_APPROVAL) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Job is not awaiting approval");
        }
        String actor = currentUser();
        GuardDecision decision = guardService.authorize(job,
                job.getMissionType() == MissionType.L1_SUPPORT ? "L1_RESPOND" : "FIX", actor);
        if (!decision.allowed()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, decision.reason());
        }
        job.setApprovedBy(actor);
        job.setApprovedAt(Instant.now());
        job.setUpdatedAt(Instant.now());
        traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "APPROVE",
                job.getMissionType() == MissionType.L1_SUPPORT ? "L1 draft" : "change plan");
        if (job.getMissionType() == MissionType.L1_SUPPORT) {
            jobRepository.save(job);
            l1SupportService.postApprovedResponse(job, actor);
            return jobRepository.findById(jobId).orElse(job);
        }
        job.transitionTo(JobStatus.RECEIVED);
        job = jobRepository.save(job);
        sseBroadcastService.broadcastJobUpdate(job);
        jobCompletionRegistry.complete(jobId);
        dispatch(job);
        return job;
    }

    public Job reject(String jobId, String reason) {
        Job job = requireJob(jobId);
        if (job.getStatus() != JobStatus.AWAITING_APPROVAL) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Job is not awaiting approval");
        }
        String actor = currentUser();
        if (job.getMissionType() == MissionType.L1_SUPPORT) {
            GuardDecision decision = guardService.authorize(job, "L1_ESCALATE", actor);
            if (!decision.allowed()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, decision.reason());
            }
            job.transitionTo(JobStatus.ESCALATED);
            job.setL1EscalationReason(reason == null || reason.isBlank() ? "Rejected by " + actor : reason);
            job.setUpdatedAt(Instant.now());
            job = jobRepository.save(job);
            sseBroadcastService.broadcastJobUpdate(job);
            traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "REJECT", job.getL1EscalationReason());
            return job;
        }
        job.transitionTo(JobStatus.FAILED);
        job.setFailureReason(reason == null || reason.isBlank() ? "Change plan rejected by " + actor : reason);
        job.setUpdatedAt(Instant.now());
        job = jobRepository.save(job);
        jobCompletionRegistry.complete(jobId);
        sseBroadcastService.broadcastJobUpdate(job);
        traceService.record(job.getId(), job.getProjectId(), "APPROVAL", actor, "REJECT", job.getFailureReason());
        return job;
    }

    public void dispatch(Job job) {
        Project project = projectRepository.findById(job.getProjectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        if (job.getMissionType() == MissionType.L1_SUPPORT) {
            executor.submit(() -> l1SupportService.investigate(job));
            return;
        }
        jobQueueService.submit(job, project);
    }

    public String sageContextFor(Job job) {
        String query = (job.getTicketTitle() == null ? "" : job.getTicketTitle()) + " "
                + (job.getTicketDescription() == null ? "" : job.getTicketDescription());
        return sageService.formatForPrompt(sageService.retrieve(job.getProjectId(), query, 5));
    }

    private Job requireJob(String jobId) {
        return jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
    }

    private void abortRunnerQuietly(String jobId) {
        try {
            jobRunnerClient.abortTask(jobId);
        } catch (Exception ignored) {
            // Runner may already have finished.
        }
    }

    private String currentUser() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "unknown";
        }
    }
}
