package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.ZohoConnectionTestRequest;
import com.encipherhealth.codehealer.dto.ZohoConnectionTestResponse;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.service.ZohoConnectionTestService;
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
@RequestMapping("/api/admin/zoho")
@RequiredArgsConstructor
public class AdminZohoController {

    private final ZohoConnectionTestService connectionTestService;
    private final UserRepository userRepository;
    private final PageAccessService pageAccessService;

    @PostMapping("/test-connection")
    public ZohoConnectionTestResponse testConnection(@Valid @RequestBody ZohoConnectionTestRequest request) {
        // Reachable from the Guide page's Zoho Sprints wizard, so ADMIN access alone shouldn't be
        // required - GUIDE access (or ADMIN) is enough.
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (!pageAccessService.hasAccess(user, PageAccessService.GUIDE) && !pageAccessService.hasAccess(user, PageAccessService.ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No access to this page");
        }
        try {
            return connectionTestService.testConnection(request.getClientId(), request.getClientSecret(), request.getCode());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage());
        }
    }
}
