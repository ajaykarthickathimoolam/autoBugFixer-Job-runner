package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.dto.LoginRequest;
import com.encipherhealth.codehealer.dto.LoginResponse;
import com.encipherhealth.codehealer.dto.MeResponse;
import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.JwtService;
import com.encipherhealth.codehealer.security.PageAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PageAccessService pageAccessService;

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
