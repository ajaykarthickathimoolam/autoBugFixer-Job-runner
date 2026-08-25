package com.encipherhealth.codehealer.dto;

/**
 * Platform-agnostic ticket snapshot handed to {@code JobIntakeService}.
 * {@code containerId} is Zoho's sprint/backlog id; unused for Jira.
 */
public record NormalizedTicket(
        String ticketId,
        String title,
        String description,
        String creatorName,
        String assigneeName,
        String containerId
) {
}
