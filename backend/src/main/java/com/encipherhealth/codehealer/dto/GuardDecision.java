package com.encipherhealth.codehealer.dto;

public record GuardDecision(
        boolean allowed,
        String reason,
        String haltStatus
) {
    public static GuardDecision allow() {
        return new GuardDecision(true, null, null);
    }

    public static GuardDecision deny(String reason, String haltStatus) {
        return new GuardDecision(false, reason, haltStatus);
    }
}
