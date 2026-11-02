package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.JobPageResponse;
import com.encipherhealth.codehealer.dto.JobResponse;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.JobRepository;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import com.encipherhealth.codehealer.service.JobIntakeService;
import com.encipherhealth.codehealer.service.JobMapper;
import com.encipherhealth.codehealer.service.MissionControlService;
import com.encipherhealth.codehealer.service.TraceService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
public class JobController {

    private static final int DEFAULT_PAGE_SIZE = 6;
    private static final int MAX_PAGE_SIZE = 200;

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;
    private final JobIntakeService jobIntakeService;
    private final JobMapper jobMapper;
    private final MissionControlService missionControlService;
    private final TraceService traceService;
    private final MongoTemplate mongoTemplate;

    @GetMapping
    public JobPageResponse list(@RequestParam(required = false) String projectId,
                                 @RequestParam(required = false) String status,
                                 @RequestParam(required = false) String ticketId,
                                 @RequestParam(required = false) String ticketTitle,
                                 @RequestParam(required = false) String from,
                                 @RequestParam(required = false) String to,
                                 @RequestParam(defaultValue = "1") int page,
                                 @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) int pageSize) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        List<String> allowedIds = projectAccessService.currentUserAllowedProjectIds();

        int safePage = Math.max(1, page);
        int safePageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
        Pageable pageable = PageRequest.of(safePage - 1, safePageSize, Sort.by("createdAt").descending());

        JobStatus statusFilter = parseStatus(status);
        Instant fromInstant = parseInstant(from);
        Instant toInstant = parseInstant(to);

        Query countQuery = buildJobQuery(allowedIds, projectId, statusFilter, ticketId, ticketTitle, fromInstant, toInstant);
        long total = mongoTemplate.count(countQuery, Job.class);

        Query findQuery = buildJobQuery(allowedIds, projectId, statusFilter, ticketId, ticketTitle, fromInstant, toInstant)
                .with(pageable);
        List<Job> jobs = mongoTemplate.find(findQuery, Job.class);

        Map<String, Project> projectCache = projectRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(Project::getId, p -> p));

        List<JobResponse> items = jobs.stream()
                .map(j -> jobMapper.toResponse(j, projectCache.get(j.getProjectId())))
                .toList();

        int totalPages = safePageSize > 0 ? (int) Math.ceil((double) total / safePageSize) : 0;
        return new JobPageResponse(items, safePage, safePageSize, total, totalPages);
    }

    private Query buildJobQuery(List<String> allowedIds, String projectId, JobStatus statusFilter,
                                 String ticketId, String ticketTitle, Instant from, Instant to) {
        Query query = new Query();
        query.addCriteria(Criteria.where("projectId").in(allowedIds));
        if (projectId != null && !projectId.isBlank()) {
            query.addCriteria(Criteria.where("projectId").is(projectId));
        }
        if (statusFilter != null) {
            query.addCriteria(Criteria.where("status").is(statusFilter));
        }
        if (ticketId != null && !ticketId.isBlank()) {
            query.addCriteria(Criteria.where("ticketId").regex(Pattern.quote(ticketId), "i"));
        }
        if (ticketTitle != null && !ticketTitle.isBlank()) {
            query.addCriteria(Criteria.where("ticketTitle").regex(Pattern.quote(ticketTitle), "i"));
        }
        if (from != null || to != null) {
            Criteria dateCriteria = Criteria.where("createdAt");
            if (from != null) {
                dateCriteria = dateCriteria.gte(from);
            }
            if (to != null) {
                dateCriteria = dateCriteria.lte(to);
            }
            query.addCriteria(dateCriteria);
        }
        return query;
    }

    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (Exception e) {
            return null;
        }
    }

    private JobStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return JobStatus.valueOf(status.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping("/{id}")
    public JobResponse get(@PathVariable String id) {
        return withJob(id, job -> job);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        projectAccessService.requireAccess(job.getProjectId());
        jobRepository.deleteById(id);
    }

    @PostMapping("/{id}/retry")
    public JobResponse retry(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        Job existing = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        projectAccessService.requireAccess(existing.getProjectId());
        Job job = jobIntakeService.retryFailedJob(id);
        Project project = projectRepository.findById(job.getProjectId()).orElse(null);
        return jobMapper.toResponse(job, project);
    }

    @PostMapping("/{id}/pause")
    public JobResponse pause(@PathVariable String id) {
        authorize(id);
        return withJob(id, job -> missionControlService.pause(id));
    }

    @PostMapping("/{id}/resume")
    public JobResponse resume(@PathVariable String id) {
        authorize(id);
        return withJob(id, job -> missionControlService.resume(id));
    }

    @PostMapping("/{id}/cancel")
    public JobResponse cancel(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        authorize(id);
        String reason = body == null ? null : body.get("reason");
        return withJob(id, job -> missionControlService.cancel(id, reason));
    }

    @PostMapping("/{id}/approve")
    public JobResponse approve(@PathVariable String id) {
        authorize(id);
        return withJob(id, job -> missionControlService.approve(id));
    }

    @PostMapping("/{id}/answer")
    public JobResponse answer(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        authorize(id);
        String answer = body == null ? null : body.get("answer");
        return withJob(id, job -> missionControlService.submitClarification(id, answer));
    }

    @PostMapping("/{id}/reject")
    public JobResponse reject(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        authorize(id);
        String reason = body == null ? null : body.get("reason");
        return withJob(id, job -> missionControlService.reject(id, reason));
    }

    @GetMapping("/{id}/trace")
    public Object trace(@PathVariable String id) {
        authorize(id);
        return traceService.forJob(id);
    }

    private void authorize(String id) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        projectAccessService.requireAccess(job.getProjectId());
    }

    private JobResponse withJob(String id, java.util.function.Function<Job, Job> transform) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        projectAccessService.requireAccess(job.getProjectId());
        Job updated = transform.apply(job);
        Project project = projectRepository.findById(updated.getProjectId()).orElse(null);
        return jobMapper.toResponse(updated, project);
    }
}
