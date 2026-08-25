package com.encipherhealth.codehealer.security;

import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.ProjectRepository;
import com.encipherhealth.codehealer.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Per-user restriction on which projects they can see/manage, layered under PROJECTS page access. */
@Component
@RequiredArgsConstructor
public class ProjectAccessService {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;

    public boolean hasAccess(User user, String projectId) {
        // Null allowedProjectIds is a legacy/unrestricted record - treat as access to everything.
        return user.getAllowedProjectIds() == null || user.getAllowedProjectIds().contains(projectId);
    }

    /** Throws 403 unless the currently authenticated user can access {@code projectId}. */
    public void requireAccess(String projectId) {
        User user = currentUser();
        if (!hasAccess(user, projectId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No access to this project");
        }
    }

    /** The project ids the current user can see - all of them if unrestricted. */
    public List<String> currentUserAllowedProjectIds() {
        return effectiveProjectIds(currentUser());
    }

    /** The project ids a user can see, resolved against the live project list if they're unrestricted. */
    public List<String> effectiveProjectIds(User user) {
        if (user.getAllowedProjectIds() != null) {
            return user.getAllowedProjectIds();
        }
        return projectRepository.findAll().stream().map(Project::getId).toList();
    }

    private User currentUser() {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }
}
