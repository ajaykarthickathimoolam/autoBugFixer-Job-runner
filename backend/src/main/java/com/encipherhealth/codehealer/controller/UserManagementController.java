package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.CreateUserRequest;
import com.encipherhealth.codehealer.dto.ProjectOption;
import com.encipherhealth.codehealer.dto.ResetPasswordRequest;
import com.encipherhealth.codehealer.dto.UpdateAccessRequest;
import com.encipherhealth.codehealer.dto.UserResponse;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

/**
 * The seeded admin account ({@code app.seed.admin-username}) is a permanent super admin: always
 * full page access (never editable, even by itself), never deletable, invisible in every other
 * admin's user list (they only see other users), and only that account itself - or literally no
 * one else - can reset its own password.
 */
@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class UserManagementController {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final PasswordEncoder passwordEncoder;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    @Value("${app.seed.admin-username}")
    private String superAdminUsername;

    @GetMapping
    public List<UserResponse> list() {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        String currentUsername = currentUsername();
        return userRepository.findAll().stream()
                .filter(u -> currentUsername.equals(superAdminUsername) || !isSuperAdmin(u))
                .map(this::toResponse)
                .toList();
    }

    /** Every project's id+name, for the "which projects can this user see" picker - deliberately
     * not filtered by the caller's own project access (see {@link ProjectOption}). */
    @GetMapping("/projects")
    public List<ProjectOption> listProjectOptions() {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        return projectRepository.findAll().stream().map(p -> new ProjectOption(p.getId(), p.getName())).toList();
    }

    @PostMapping
    public UserResponse create(@Valid @RequestBody CreateUserRequest request) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already exists");
        }
        validatePages(request.getPageAccess());
        validateProjectIds(request.getAllowedProjectIds());

        User user = User.builder()
                .username(request.getUsername())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .pageAccess(request.getPageAccess() != null ? request.getPageAccess() : List.of())
                .allowedProjectIds(request.getAllowedProjectIds() != null ? request.getAllowedProjectIds() : List.of())
                .createdAt(Instant.now())
                .build();
        return toResponse(userRepository.save(user));
    }

    @PutMapping("/{id}/password")
    public void resetPassword(@PathVariable String id, @Valid @RequestBody ResetPasswordRequest request) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        User user = findOrThrow(id);
        if (isSuperAdmin(user) && !currentUsername().equals(superAdminUsername)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the super admin can reset its own password");
        }
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        userRepository.save(user);
    }

    @PutMapping("/{id}/access")
    public UserResponse updateAccess(@PathVariable String id, @RequestBody UpdateAccessRequest request) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        validatePages(request.getPageAccess());
        validateProjectIds(request.getAllowedProjectIds());
        User user = findOrThrow(id);
        if (isSuperAdmin(user)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The super admin always has full access");
        }
        user.setPageAccess(request.getPageAccess() != null ? request.getPageAccess() : List.of());
        user.setAllowedProjectIds(request.getAllowedProjectIds() != null ? request.getAllowedProjectIds() : List.of());
        return toResponse(userRepository.save(user));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        User user = findOrThrow(id);
        if (isSuperAdmin(user)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delete the super admin");
        }
        if (user.getUsername().equals(currentUsername())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delete your own account");
        }
        if (userRepository.count() <= 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delete the last remaining user");
        }
        userRepository.deleteById(id);
    }

    private void validatePages(List<String> pageAccess) {
        if (pageAccess == null) {
            return;
        }
        for (String page : pageAccess) {
            if (!PageAccessService.isValidPage(page)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown page: " + page);
            }
        }
    }

    private void validateProjectIds(List<String> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) {
            return;
        }
        for (String projectId : projectIds) {
            if (!projectRepository.existsById(projectId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown project: " + projectId);
            }
        }
    }

    private boolean isSuperAdmin(User user) {
        return user.getUsername().equals(superAdminUsername);
    }

    private String currentUsername() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private User findOrThrow(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getUsername(), pageAccessService.effectiveAccess(user),
                projectAccessService.effectiveProjectIds(user), isSuperAdmin(user), user.getCreatedAt());
    }
}
