package com.encipherhealth.codehealer.dto;

import java.time.Instant;

/** Lightweight project card for the Board gallery - deliberately not {@link ProjectResponse}, which
 * carries secret-presence flags/services/architectureMd that don't belong on a Board card. */
public record BoardProjectSummary(String id, String name, String agilePlatform, String externalId, Instant lastPolledAt) {
}
