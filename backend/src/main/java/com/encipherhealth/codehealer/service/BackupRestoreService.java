package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.KnowledgeDocument;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.ExceptionRecordRepository;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BackupRestoreService {

    private final KnowledgeDocumentRepositoryHolder knowledge;
    private final SettingsRepository settingsRepository;
    private final JobRepository jobRepository;
    private final ExceptionRecordRepository exceptionRecordRepository;
    private final SageService sageService;
    private final TraceService traceService;
    private final PageAccessService pageAccessService;
    private final WebClient.Builder webClientBuilder;

    @Value("${app.job-runner.base-url}")
    private String jobRunnerBaseUrl;

    public Map<String, Object> exportBackup() {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        Settings settings = settingsRepository.findById("global").orElse(null);
        if (settings != null) {
            settings.setLastBackupAt(Instant.now());
            settingsRepository.save(settings);
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("exportedAt", Instant.now().toString());
        payload.put("knowledge", sageService.all());
        payload.put("settings", settingsSnapshot(settings));
        payload.put("openExceptions", exceptionRecordRepository.findByStatusOrderByCreatedAtDesc("OPEN"));
        payload.put("openMissions", jobRepository.findAll().stream()
                .filter(j -> !isTerminal(j.getStatus()))
                .map(j -> Map.of(
                        "id", j.getId(),
                        "ticketId", j.getTicketId() == null ? "" : j.getTicketId(),
                        "status", j.getStatus().name(),
                        "missionType", j.getMissionType() == null ? "CODING" : j.getMissionType().name()))
                .toList());
        traceService.record(null, null, "RECOVERY", currentUser(), "BACKUP", "Configuration export");
        return payload;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> restore(Map<String, Object> payload) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        Object knowledgeRaw = payload.get("knowledge");
        if (knowledgeRaw instanceof List<?> list) {
            List<KnowledgeDocument> docs = list.stream()
                    .filter(Map.class::isInstance)
                    .map(item -> knowledge.fromMap((Map<String, Object>) item))
                    .toList();
            sageService.replaceAll(docs);
        }
        Object settingsRaw = payload.get("settings");
        if (settingsRaw instanceof Map<?, ?> map) {
            Settings settings = settingsRepository.findById("global").orElseGet(() -> Settings.builder().id("global").build());
            Object kill = map.get("killSwitchArmed");
            if (kill instanceof Boolean b) {
                settings.setKillSwitchArmed(b);
            }
            Object req = map.get("requireChangePlanApproval");
            if (req instanceof Boolean b) {
                settings.setRequireChangePlanApproval(b);
            }
            Object tests = map.get("testsMustPass");
            if (tests instanceof Boolean b) {
                settings.setTestsMustPass(b);
            }
            Object scans = map.get("securityScansEnabled");
            if (scans instanceof Boolean b) {
                settings.setSecurityScansEnabled(b);
            }
            Object fail = map.get("failClosedEnabled");
            if (fail instanceof Boolean b) {
                settings.setFailClosedEnabled(b);
            }
            settingsRepository.save(settings);
        }
        traceService.record(null, null, "RECOVERY", currentUser(), "RESTORE", "Configuration restore");
        return Map.of("ok", true, "restoredAt", Instant.now().toString());
    }

    public Map<String, Object> recoveryDrill() {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        Map<String, Object> report = new HashMap<>();
        report.put("startedAt", Instant.now().toString());
        try {
            jobRepository.count();
            report.put("mongodb", "ok");
        } catch (Exception e) {
            report.put("mongodb", "fail: " + e.getMessage());
        }
        try {
            String body = webClientBuilder.build()
                    .get()
                    .uri(jobRunnerBaseUrl + "/health")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(5));
            report.put("jobRunner", body == null ? "ok" : body);
        } catch (Exception e) {
            report.put("jobRunner", "fail: " + e.getMessage());
        }
        Settings settings = settingsRepository.findById("global").orElse(null);
        report.put("failClosedEnabled", settings == null || settings.isFailClosedEnabled());
        report.put("killSwitchArmed", settings != null && settings.isKillSwitchArmed());
        report.put("lastBackupAt", settings == null || settings.getLastBackupAt() == null
                ? null : settings.getLastBackupAt().toString());
        report.put("openExceptions", exceptionRecordRepository.countByStatus("OPEN"));
        report.put("rtoNote", "Agents stop when Guard/Mongo are unavailable (fail-closed). Existing ITSM/Git continue manually.");
        report.put("rpoNote", "Restore Sage documents and Guard flags from the last export. Secrets are never included in backups.");
        traceService.record(null, null, "RECOVERY", currentUser(), "DRILL", report.get("mongodb") + " / " + report.get("jobRunner"));
        report.put("finishedAt", Instant.now().toString());
        return report;
    }

    private Map<String, Object> settingsSnapshot(Settings settings) {
        if (settings == null) {
            return Map.of();
        }
        Map<String, Object> map = new HashMap<>();
        map.put("killSwitchArmed", settings.isKillSwitchArmed());
        map.put("killSwitchReason", settings.getKillSwitchReason());
        map.put("requireChangePlanApproval", settings.isRequireChangePlanApproval());
        map.put("testsMustPass", settings.isTestsMustPass());
        map.put("securityScansEnabled", settings.isSecurityScansEnabled());
        map.put("failClosedEnabled", settings.isFailClosedEnabled());
        map.put("maxConcurrentJobs", settings.getMaxConcurrentJobs());
        map.put("llmProvider", settings.getLlmProvider());
        map.put("lastBackupAt", settings.getLastBackupAt() == null ? null : settings.getLastBackupAt().toString());
        return map;
    }

    private boolean isTerminal(JobStatus status) {
        return status == JobStatus.NOTIFIED || status == JobStatus.FAILED || status == JobStatus.CANCELLED
                || status == JobStatus.CLOSED || status == JobStatus.ESCALATED;
    }

    private String currentUser() {
        try {
            return org.springframework.security.core.context.SecurityContextHolder.getContext()
                    .getAuthentication().getName();
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * Tiny helper so restore can rebuild {@link KnowledgeDocument} without pulling Jackson
     * conversion into SageService.
     */
    @Service
    public static class KnowledgeDocumentRepositoryHolder {
        KnowledgeDocument fromMap(Map<String, Object> item) {
            KnowledgeDocument doc = new KnowledgeDocument();
            Object id = item.get("id");
            if (id instanceof String s) {
                doc.setId(s);
            }
            doc.setProjectId(asString(item.get("projectId")));
            doc.setTitle(asString(item.get("title")));
            doc.setSource(asString(item.get("source")));
            doc.setContent(asString(item.get("content")));
            Object version = item.get("version");
            doc.setVersion(version instanceof Number n ? n.intValue() : 1);
            doc.setVisibility(asString(item.get("visibility")));
            doc.setCreatedBy(asString(item.get("createdBy")));
            return doc;
        }

        private String asString(Object value) {
            return value == null ? null : String.valueOf(value);
        }
    }
}
