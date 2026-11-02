package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.JobStatusEvent;
import com.encipherhealth.codehealer.model.MissionType;

import java.util.List;
import java.util.Locale;

/**
 * Decides which pipeline step a retry should continue from. Steps that already succeeded
 * are not repeated: a pull-request failure does not clone or call the fixer again.
 */
public final class ResumePoint {

    private ResumePoint() {
    }

    public static String forFailedJob(Job job) {
        if (job == null || job.getMissionType() == MissionType.L1_SUPPORT) {
            return null;
        }
        String reason = job.getFailureReason() == null ? "" : job.getFailureReason().toLowerCase(Locale.ROOT);
        if (isDispatchFailure(reason) && job.getResumeFrom() != null && !job.getResumeFrom().isBlank()) {
            return job.getResumeFrom().trim().toUpperCase(Locale.ROOT);
        }
        if (reason.contains("pr creation failed")) {
            return "PR";
        }
        if (reason.contains("push failed")) {
            return "PUSH";
        }
        if (reason.contains("security scan failed")) {
            return "SCAN";
        }
        if (reason.contains("build failed") || reason.contains("tests failed")) {
            return "VERIFY";
        }
        if (reason.contains("fixer failed") || reason.contains("claude code cli failed") || reason.contains("made no changes")) {
            return "FIX";
        }
        if (reason.contains("git clone failed") || reason.contains("checkout ") || reason.contains("local task clone")) {
            return "CLONE";
        }
        JobStatus previous = previousStatus(job);
        if (previous == null) {
            return "CLONE";
        }
        return switch (previous) {
            case ANALYZING, AWAITING_APPROVAL -> "PLAN";
            case FIXING -> "FIX";
            case VERIFYING -> "VERIFY";
            case SCANNING -> "SCAN";
            default -> "CLONE";
        };
    }

    public static String guardAction(String resumeFrom) {
        return switch (normalize(resumeFrom)) {
            case "PLAN" -> "ANALYZE";
            case "FIX" -> "FIX";
            case "VERIFY" -> "VERIFY";
            case "SCAN" -> "SCAN";
            case "PUSH", "PR" -> "CREATE_PR";
            default -> "CLONE";
        };
    }

    public static boolean marksCloning(String resumeFrom) {
        String step = normalize(resumeFrom);
        return step.equals("CLONE") || step.equals("FIX");
    }

    private static boolean isDispatchFailure(String reason) {
        return reason.startsWith("failed to start job-runner")
                || reason.startsWith("failed to resume job-runner")
                || reason.startsWith("timed out waiting");
    }

    private static String normalize(String resumeFrom) {
        return resumeFrom == null || resumeFrom.isBlank() ? "CLONE" : resumeFrom.trim().toUpperCase(Locale.ROOT);
    }

    private static JobStatus previousStatus(Job job) {
        List<JobStatusEvent> history = job.getStatusHistory();
        if (history == null || history.size() < 2) {
            return null;
        }
        for (int i = history.size() - 1; i >= 0; i--) {
            if (history.get(i).getStatus() == JobStatus.FAILED && i > 0) {
                return history.get(i - 1).getStatus();
            }
        }
        return history.get(history.size() - 2).getStatus();
    }
}
