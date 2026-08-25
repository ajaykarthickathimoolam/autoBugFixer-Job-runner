package com.encipherhealth.codehealer.dto;

public record GptConnectionTestRequest(String endpoint, String apiKey, String apiVersion, String deployment) {
}
