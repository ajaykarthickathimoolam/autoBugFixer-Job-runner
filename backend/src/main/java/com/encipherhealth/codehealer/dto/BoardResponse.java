package com.encipherhealth.codehealer.dto;

import java.util.List;

public record BoardResponse(String projectId, String projectName, List<BoardBucketResponse> buckets) {
}
