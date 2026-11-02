package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.GuardDecision;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Policy gate before an agent may act. Fail-closed: if identity, policy, or settings cannot
 * be evaluated, the action is denied.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GuardService {

    public static final List<String> DEFAULT_ALLOWED_ACTIONS = List.of(
            "CLONE", "ANALYZE", "FIX", "VERIFY", "SCAN", "CREATE_PR", "NOTIFY",
            "L1_INVESTIGATE", "L1_RESPOND", "L1_ESCALATE"
    );

    private static final Set<JobStatus> BLOCKED_JOB_STATUSES = Set.of(
            JobStatus.PAUSED, JobStatus.CANCELLED, JobStatus.FAILED, JobStatus.CLOSED,
            JobStatus.ESCALATED, JobStatus.NOTIFIED
    );

    private final SettingsRepository settingsRepository;
    private final TraceService traceService;

    public GuardDecision authorize(Job job, String action, String actor) {
        return authorize(job, action, actor, false);
    }

    /**
     * Operator resume: the job is still {@code PAUSED}, but that halt must not block the
     * human who is explicitly unpausing it. Kill switch and allowlist still apply.
     */
    public GuardDecision authorizeResume(Job job, String action, String actor) {
        return authorize(job, action, actor, true);
    }

    private GuardDecision authorize(Job job, String action, String actor, boolean operatorResume) {
        try {
            Settings settings = settingsRepository.findById("global").orElse(null);
            if (settings == null) {
                return denyAndTrace(job, action, actor, "Guard fail-closed: settings unavailable", "FAILED");
            }
            if (settings.isKillSwitchArmed()) {
                String reason = settings.getKillSwitchReason() == null || settings.getKillSwitchReason().isBlank()
                        ? "Kill switch armed. Disarm it in Admin → Settings, then Resume."
                        : "Kill switch armed: " + settings.getKillSwitchReason()
                                + ". Disarm it in Admin → Settings, then Resume.";
                return denyAndTrace(job, action, actor, reason, "PAUSED");
            }
            if (!operatorResume && job != null && job.getStatus() != null
                    && BLOCKED_JOB_STATUSES.contains(job.getStatus())) {
                return denyAndTrace(job, action, actor,
                        "Job is " + job.getStatus() + " and cannot take further agent actions",
                        job.getStatus().name());
            }
            String normalized = action == null ? "" : action.strip().toUpperCase(Locale.ROOT);
            List<String> allowed = settings.getAllowedActions() == null || settings.getAllowedActions().isEmpty()
                    ? DEFAULT_ALLOWED_ACTIONS
                    : settings.getAllowedActions().stream().map(a -> a.strip().toUpperCase(Locale.ROOT)).toList();
            if (!allowed.contains(normalized)) {
                return denyAndTrace(job, action, actor, "Action not on Guard allowlist: " + normalized, "FAILED");
            }
            return GuardDecision.allow();
        } catch (Exception e) {
            log.warn("Guard fail-closed on error for action {}: {}", action, e.getMessage());
            return denyAndTrace(job, action, actor, "Guard fail-closed: " + e.getMessage(), "FAILED");
        }
    }

    public boolean isKillSwitchArmed() {
        try {
            return settingsRepository.findById("global").map(Settings::isKillSwitchArmed).orElse(false);
        } catch (Exception e) {
            return true;
        }
    }

    public Settings currentSettingsOrFailClosed() {
        return settingsRepository.findById("global").orElseThrow(
                () -> new IllegalStateException("Guard fail-closed: settings unavailable"));
    }

    private GuardDecision denyAndTrace(Job job, String action, String actor, String reason, String haltStatus) {
        traceService.record(
                job != null ? job.getId() : null,
                job != null ? job.getProjectId() : null,
                "GUARD",
                actor != null ? actor : "system",
                action,
                reason);
        return GuardDecision.deny(reason, haltStatus);
    }
}
