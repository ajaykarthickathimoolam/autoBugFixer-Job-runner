package com.encipherhealth.codehealer.dto;

public record TaskServiceInfo(
        String serviceId,
        String name,
        String repoUrl,
        String baseBranch,
        String architectureMd,
        String buildCommand,
        String testCommand
) {
}
