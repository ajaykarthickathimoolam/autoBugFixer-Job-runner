package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.BoardProjectSummary;
import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import com.encipherhealth.codehealer.service.ticket.TicketPlatformRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Read-only browsing of the live ticket board (Zoho Sprints or Jira). */
@RestController
@RequestMapping("/api/board")
@RequiredArgsConstructor
@Slf4j
public class BoardController {

    private final ProjectRepository projectRepository;
    private final TicketPlatformRegistry ticketPlatformRegistry;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    @GetMapping("/projects")
    public List<BoardProjectSummary> listProjects() {
        pageAccessService.requireAccess(PageAccessService.BOARD);
        List<String> allowedIds = projectAccessService.currentUserAllowedProjectIds();
        return projectRepository.findAll().stream()
                .filter(p -> allowedIds.contains(p.getId()))
                .filter(this::hasBoardConfigured)
                .map(p -> new BoardProjectSummary(
                        p.getId(),
                        p.getName(),
                        p.resolvedPlatform().name(),
                        p.resolvedPlatform() == AgilePlatform.JIRA ? p.getJiraProjectKey() : p.getZohoProjectIdExternal(),
                        p.getLastPolledAt()))
                .toList();
    }

    @GetMapping("/projects/{id}")
    public BoardResponse getBoard(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.BOARD);
        projectAccessService.requireAccess(id);
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        if (!hasBoardConfigured(project)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project has no ticket board configured");
        }
        try {
            return ticketPlatformRegistry.forProject(project).fetchBoard(project);
        } catch (Exception e) {
            log.error("Failed to fetch board for project {}", id, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Board request failed: " + e.getMessage());
        }
    }

    private boolean hasBoardConfigured(Project p) {
        return ticketPlatformRegistry.forProject(p).isConfigured(p);
    }
}
