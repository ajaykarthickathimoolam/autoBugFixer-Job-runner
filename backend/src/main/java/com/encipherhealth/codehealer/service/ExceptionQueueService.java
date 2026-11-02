package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.ExceptionRecord;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.repository.ExceptionRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ExceptionQueueService {

    private final ExceptionRecordRepository exceptionRecordRepository;
    private final TraceService traceService;

    public ExceptionRecord open(Job job, String kind, String message) {
        ExceptionRecord record = ExceptionRecord.builder()
                .jobId(job.getId())
                .projectId(job.getProjectId())
                .kind(kind)
                .message(message)
                .status("OPEN")
                .createdAt(Instant.now())
                .build();
        record = exceptionRecordRepository.save(record);
        traceService.record(job.getId(), job.getProjectId(), "EXCEPTION", "system", kind, message);
        return record;
    }

    public List<ExceptionRecord> openItems() {
        return exceptionRecordRepository.findByStatusOrderByCreatedAtDesc("OPEN");
    }

    public long openCount() {
        return exceptionRecordRepository.countByStatus("OPEN");
    }

    public ExceptionRecord resolve(String id, String resolvedBy) {
        ExceptionRecord record = exceptionRecordRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Exception not found"));
        record.setStatus("RESOLVED");
        record.setResolvedAt(Instant.now());
        record.setResolvedBy(resolvedBy);
        return exceptionRecordRepository.save(record);
    }
}
