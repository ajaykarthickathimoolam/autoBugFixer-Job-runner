package com.encipherhealth.codehealer.security;

import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;

/** The five pages a user's access can be granted/restricted per: Dashboard, Projects, Admin, User Guide, Board. */
@Component
@RequiredArgsConstructor
public class PageAccessService {

    public static final String DASHBOARD = "DASHBOARD";
    public static final String PROJECTS = "PROJECTS";
    public static final String ADMIN = "ADMIN";
    public static final String GUIDE = "GUIDE";
    public static final String BOARD = "BOARD";

    public static final List<String> ALL_PAGES = List.of(DASHBOARD, PROJECTS, ADMIN, GUIDE, BOARD);
    private static final Set<String> VALID_PAGES = Set.copyOf(ALL_PAGES);

    private final UserRepository userRepository;

    public static boolean isValidPage(String page) {
        return VALID_PAGES.contains(page);
    }

    /** Throws 403 unless the currently authenticated user has access to {@code page}. */
    public void requireAccess(String page) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (!hasAccess(user, page)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No access to this page");
        }
    }

    public boolean hasAccess(User user, String page) {
        // Null pageAccess is a legacy record predating this feature - treat as full access.
        return user.getPageAccess() == null || user.getPageAccess().contains(page);
    }

    /** The pages a user can actually access, normalized so API responses never have to special-case null. */
    public List<String> effectiveAccess(User user) {
        return user.getPageAccess() != null ? user.getPageAccess() : ALL_PAGES;
    }
}
