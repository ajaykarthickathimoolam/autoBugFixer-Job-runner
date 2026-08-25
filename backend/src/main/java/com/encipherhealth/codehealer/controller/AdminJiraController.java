package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.JiraConnectionTestRequest;
import com.encipherhealth.codehealer.dto.JiraConnectionTestResponse;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.service.JiraConnectionTestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/jira")
@RequiredArgsConstructor
public class AdminJiraController {

    private final JiraConnectionTestService connectionTestService;
    private final UserRepository userRepository;
    private final PageAccessService pageAccessService;

    @PostMapping("/test-connection")
    public JiraConnectionTestResponse testConnection(@Valid @RequestBody JiraConnectionTestRequest request) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (!pageAccessService.hasAccess(user, PageAccessService.GUIDE)
                && !pageAccessService.hasAccess(user, PageAccessService.ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No access to this page");
        }
        try {
            return connectionTestService.testConnection(request.getBaseUrl(), request.getEmail(), request.getApiToken());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage());
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Jira request failed: " + e.getMessage());
        }
    }
}
