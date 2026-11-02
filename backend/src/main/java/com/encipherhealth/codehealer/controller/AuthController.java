package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.LoginRequest;
import com.encipherhealth.codehealer.dto.LoginResponse;
import com.encipherhealth.codehealer.dto.MeResponse;
import com.encipherhealth.codehealer.dto.RegisterRequest;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.JwtService;
import com.encipherhealth.codehealer.security.PageAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PageAccessService pageAccessService;

    @Value("${app.seed.admin-username}")
    private String superAdminUsername;

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        String token = jwtService.generateToken(user.getUsername());
        return new LoginResponse(token, user.getUsername(), pageAccessService.effectiveAccess(user));
    }

    /** Public account creation. New users can open every page and every project so they can
     * configure the workspace. The seeded super-admin name cannot be registered. */
    @PostMapping("/register")
    public LoginResponse register(@RequestBody RegisterRequest request) {
        String username = request.getUsername() == null ? "" : request.getUsername().trim();
        String password = request.getPassword() == null ? "" : request.getPassword();
        if (!username.matches("[A-Za-z0-9._@-]{3,32}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Username must be 3–32 characters: letters, numbers, dots, underscores, hyphens, or @");
        }
        if (password.length() < 8 || password.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be 8–128 characters");
        }
        if (username.equalsIgnoreCase(superAdminUsername) || userRepository.findByUsername(username).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already exists");
        }

        User user = User.builder()
                .username(username)
                .passwordHash(passwordEncoder.encode(password))
                .pageAccess(PageAccessService.ALL_PAGES)
                .createdAt(Instant.now())
                .build();
        userRepository.save(user);
        String token = jwtService.generateToken(user.getUsername());
        return new LoginResponse(token, user.getUsername(), pageAccessService.effectiveAccess(user));
    }

    /** Lets an already-logged-in session refresh its page access (e.g. after an admin changes it,
     * or a new page is added) without forcing a re-login - /api/auth/** is permitAll for routing
     * purposes, but JwtAuthFilter still populates the SecurityContext when a valid token is sent,
     * so a missing/invalid token here just means no authentication was set. */
    @GetMapping("/me")
    public MeResponse me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        return new MeResponse(user.getUsername(), pageAccessService.effectiveAccess(user));
    }
}
