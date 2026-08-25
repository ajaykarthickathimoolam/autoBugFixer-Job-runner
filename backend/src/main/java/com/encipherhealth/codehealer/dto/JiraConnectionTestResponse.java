package com.encipherhealth.codehealer.dto;

import java.util.List;

public record JiraConnectionTestResponse(
        String displayName,
        String email,
        String timeZone,
        List<JiraProjectSummary> projects
) {
}
