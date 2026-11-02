package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.KnowledgeRequest;
import com.encipherhealth.codehealer.model.KnowledgeDocument;
import com.encipherhealth.codehealer.model.SageCitation;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import com.encipherhealth.codehealer.service.SageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/sage")
@RequiredArgsConstructor
public class SageController {

    private final SageService sageService;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    @GetMapping
    public List<KnowledgeDocument> list(@RequestParam String projectId) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        return sageService.listForProject(projectId);
    }

    @PostMapping
    public KnowledgeDocument ingest(@RequestBody KnowledgeRequest request) {
        return sageService.ingest(request.projectId(), request.title(), request.source(),
                request.content(), request.visibility());
    }

    @PutMapping("/{id}")
    public KnowledgeDocument update(@PathVariable String id, @RequestBody KnowledgeRequest request) {
        return sageService.update(id, request.title(), request.source(), request.content(), request.visibility());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        sageService.delete(id);
    }

    @GetMapping("/search")
    public List<SageCitation> search(@RequestParam String projectId, @RequestParam String q) {
        pageAccessService.requireAccess(PageAccessService.DASHBOARD);
        projectAccessService.requireAccess(projectId);
        return sageService.retrieve(projectId, q, 8);
    }
}
