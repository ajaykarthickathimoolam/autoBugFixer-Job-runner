package com.encipherhealth.codehealer.dto;

public record KnowledgeRequest(
        String projectId,
        String title,
        String source,
        String content,
        String visibility
) {
}
