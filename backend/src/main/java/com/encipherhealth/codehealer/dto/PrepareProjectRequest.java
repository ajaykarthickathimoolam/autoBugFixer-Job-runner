package com.encipherhealth.codehealer.dto;

import java.util.List;

/** Sent to the job-runner's POST /projects/prepare to eagerly warm every service's base clone. */
public record PrepareProjectRequest(
        String projectId,
        List<TaskServiceInfo> services,
        String githubSshPrivateKey
) {
}
