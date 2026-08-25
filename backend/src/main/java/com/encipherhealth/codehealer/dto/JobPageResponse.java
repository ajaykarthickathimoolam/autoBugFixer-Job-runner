package com.encipherhealth.codehealer.dto;

import java.util.List;

/** One page of jobs, straight from a MongoDB skip/limit query - not sliced in application code. */
public record JobPageResponse(
        List<JobResponse> items,
        int page,
        int pageSize,
        long totalCount,
        int totalPages
) {
}
