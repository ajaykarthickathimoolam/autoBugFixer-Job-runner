package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.DashboardBucket;
import com.encipherhealth.codehealer.dto.DashboardStatsResponse;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.IsoFields;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final JobRepository jobRepository;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    @GetMapping("/stats")
    public DashboardStatsResponse stats(@RequestParam(required = false) String projectId,
                                         @RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to,
                                         @RequestParam(defaultValue = "day") String groupBy) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        List<String> allowedIds = projectAccessService.currentUserAllowedProjectIds();

        Instant fromInstant = from != null ? Instant.parse(from) : Instant.EPOCH;
        Instant toInstant = to != null ? Instant.parse(to) : Instant.now();

        List<Job> jobs = jobRepository.findByCreatedAtBetween(fromInstant, toInstant).stream()
                .filter(j -> allowedIds.contains(j.getProjectId()))
                .filter(j -> projectId == null || projectId.equals(j.getProjectId()))
                .toList();

        long total = jobs.size();
        long fixed = jobs.stream().filter(j -> j.getStatus() == JobStatus.NOTIFIED || j.getStatus() == JobStatus.CLOSED).count();
        long failed = jobs.stream().filter(j -> j.getStatus() == JobStatus.FAILED
                || j.getStatus() == JobStatus.CANCELLED
                || j.getStatus() == JobStatus.ESCALATED).count();
        long inProgress = total - fixed - failed;

        Map<String, long[]> buckets = new LinkedHashMap<>();
        for (Job job : jobs) {
            String label = bucketLabel(job.getCreatedAt(), groupBy);
            long[] counts = buckets.computeIfAbsent(label, k -> new long[]{0, 0, 0});
            counts[0]++;
            if (job.getStatus() == JobStatus.NOTIFIED || job.getStatus() == JobStatus.CLOSED) counts[1]++;
            if (job.getStatus() == JobStatus.FAILED || job.getStatus() == JobStatus.CANCELLED
                    || job.getStatus() == JobStatus.ESCALATED) counts[2]++;
        }

        List<DashboardBucket> bucketList = buckets.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> new DashboardBucket(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2]))
                .toList();

        return new DashboardStatsResponse(total, fixed, failed, inProgress, bucketList);
    }

    private String bucketLabel(Instant createdAt, String groupBy) {
        LocalDate date = createdAt.atZone(ZoneOffset.UTC).toLocalDate();
        return switch (groupBy.toLowerCase()) {
            case "week" -> date.getYear() + "-W" + String.format("%02d", date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
            case "month" -> date.format(DateTimeFormatter.ofPattern("yyyy-MM"));
            default -> date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        };
    }
}
