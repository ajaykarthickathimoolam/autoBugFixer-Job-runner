package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.model.ExceptionRecord;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.service.ExceptionQueueService;
import com.encipherhealth.codehealer.service.JobQueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pulse")
@RequiredArgsConstructor
public class PulseController {

    private final PageAccessService pageAccessService;
    private final JobQueueService jobQueueService;
    private final JobRepository jobRepository;
    private final ExceptionQueueService exceptionQueueService;
    private final SettingsRepository settingsRepository;

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        Settings settings = settingsRepository.findById("global").orElse(null);
        Map<String, Object> out = new HashMap<>();
        out.put("killSwitchArmed", settings != null && settings.isKillSwitchArmed());
        out.put("killSwitchReason", settings == null ? null : settings.getKillSwitchReason());
        out.put("failClosedEnabled", settings == null || settings.isFailClosedEnabled());
        out.put("activeJobs", jobQueueService.getActiveJobs());
        out.put("maxConcurrentJobs", jobQueueService.getMaxConcurrentJobs());
        out.put("awaitingApproval", jobRepository.countByStatus(JobStatus.AWAITING_APPROVAL));
        out.put("paused", jobRepository.countByStatus(JobStatus.PAUSED));
        out.put("openExceptions", exceptionQueueService.openCount());
        return out;
    }

    @GetMapping("/exceptions")
    public List<ExceptionRecord> exceptions() {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        return exceptionQueueService.openItems();
    }

    @PostMapping("/exceptions/{id}/resolve")
    public ExceptionRecord resolve(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        String actor = SecurityContextHolder.getContext().getAuthentication().getName();
        return exceptionQueueService.resolve(id, actor);
    }
}
