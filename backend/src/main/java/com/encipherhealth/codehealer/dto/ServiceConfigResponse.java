package com.encipherhealth.codehealer.dto;

public record ServiceConfigResponse(
        String id,
        String name,
        String repoUrl,
        String baseBranch,
        String architectureMd,
        String buildCommand,
        String testCommand
) {
}
