package com.encipherhealth.codehealer.dto;

import java.util.List;

public record LoginResponse(String token, String username, List<String> pageAccess) {
}
