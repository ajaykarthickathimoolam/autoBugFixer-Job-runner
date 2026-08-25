package com.encipherhealth.codehealer.dto;

import java.time.Instant;
import java.util.List;

public record UserResponse(String id, String username, List<String> pageAccess, List<String> allowedProjectIds,
                            boolean superAdmin, Instant createdAt) {
}
