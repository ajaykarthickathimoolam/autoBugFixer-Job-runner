package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.TraceEvent;
import com.encipherhealth.codehealer.repository.TraceEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TraceService {

    private final TraceEventRepository traceEventRepository;

    public TraceEvent record(String jobId, String projectId, String kind, String actor, String action, String detail) {
        TraceEvent event = TraceEvent.builder()
                .jobId(jobId)
                .projectId(projectId)
                .kind(kind)
                .actor(actor)
                .action(action)
                .detail(detail)
                .timestamp(Instant.now())
                .build();
        return traceEventRepository.save(event);
    }

    public List<TraceEvent> forJob(String jobId) {
        return traceEventRepository.findByJobIdOrderByTimestampAsc(jobId);
    }
}
