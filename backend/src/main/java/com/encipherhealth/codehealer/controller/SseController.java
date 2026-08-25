package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.security.JwtService;
import com.encipherhealth.codehealer.service.SseBroadcastService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Browsers' EventSource can't set an Authorization header, so the JWT is passed as a query param
 * here and validated manually (this path is permitAll at the security-filter level).
 */
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class SseController {

    private final SseBroadcastService sseBroadcastService;
    private final JwtService jwtService;

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@RequestParam("token") String token) {
        if (!jwtService.isValid(token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token");
        }
        return sseBroadcastService.register();
    }
}
