package com.encipherhealth.codehealer.dto;

/**
 * One ticket on the live Zoho Sprints board. {@code statusIdRaw}/{@code priorityIdRaw} are Zoho's
 * opaque internal numeric ids - no endpoint resolving them to human-readable names has ever been
 * found/confirmed, so they are intentionally not surfaced as display text anywhere in the UI.
 */
public record BoardItemResponse(
        String id,
        String title,
        String description,
        String assigneeName,
        String creatorName,
        String startDate,
        String endDate,
        String createdTime,
        Integer points,
        String statusIdRaw,
        String priorityIdRaw
) {
}
