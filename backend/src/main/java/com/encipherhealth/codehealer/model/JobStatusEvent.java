package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One entry in a job's status timeline - recorded every time its status changes. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobStatusEvent {
    private JobStatus status;
    private Instant timestamp;
}
