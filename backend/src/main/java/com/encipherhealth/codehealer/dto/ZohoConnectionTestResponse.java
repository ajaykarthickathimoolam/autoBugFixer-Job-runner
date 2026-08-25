package com.encipherhealth.codehealer.dto;

import java.util.List;

public record ZohoConnectionTestResponse(
        String refreshToken,
        String teamId,
        String teamName,
        List<ZohoProjectSummary> projects
) {
}
