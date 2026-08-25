package com.encipherhealth.codehealer.dto;

import java.util.List;

public record MeResponse(String username, List<String> pageAccess) {
}
