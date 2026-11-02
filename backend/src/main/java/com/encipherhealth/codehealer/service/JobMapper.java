package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.JobResponse;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.MissionType;
import com.encipherhealth.codehealer.model.Project;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class JobMapper {

    public JobResponse toResponse(Job job, Project project) {
        return new JobResponse(
                job.getId(),
                job.getTicketId(),
                job.getTicketTitle(),
                job.getTicketDescription(),
                job.getCreatorName(),
                job.getAssigneeName(),
                job.getProjectId(),
                project != null ? project.getName() : null,
                job.getServiceIds(),
                job.getStatus(),
                job.getStatusHistory(),
                job.getLogs(),
                job.getPrUrl(),
                job.getFailureReason(),
                job.getPendingQuestion(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                job.getMissionType() == null ? MissionType.CODING.name() : job.getMissionType().name(),
                job.getChangePlan(),
                job.getApprovedBy(),
                job.getApprovedAt(),
                job.getPausedBy(),
                job.getCancelledBy(),
                job.getCancellationReason(),
                job.getSecurityScanSummary(),
                job.getSecurityRemediationPlan(),
                job.getPendingApproval(),
                job.getL1Classification(),
                job.getL1DraftResponse(),
                job.getL1Citations(),
                job.getL1EscalationReason(),
                job.getStatus() == JobStatus.FAILED
                        ? ResumePoint.forFailedJob(job)
                        : null,
                job.getLlmProvider(),
                job.getFilesRead() == null ? List.of() : job.getFilesRead(),
                job.getFilesChanged() == null ? List.of() : job.getFilesChanged(),
                job.getCommandsRun() == null ? List.of() : job.getCommandsRun(),
                job.getTestsNotRun(),
                job.getDiffScopeSummary(),
                job.isStopRequested(),
                job.getPromptTokens(),
                job.getCompletionTokens(),
                job.getPrDisposition(),
                job.getPrDispositionBy()
        );
    }
}
