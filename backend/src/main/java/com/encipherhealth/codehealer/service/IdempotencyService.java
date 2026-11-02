package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.IdempotencyRecord;
import com.encipherhealth.codehealer.repository.IdempotencyRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IdempotencyService {

    private final IdempotencyRecordRepository repository;

    public Optional<String> lookup(String key) {
        return repository.findById(key).map(IdempotencyRecord::getResult);
    }

    public String remember(String key, String jobId, String action, String result) {
        IdempotencyRecord existing = repository.findById(key).orElse(null);
        if (existing != null) {
            return existing.getResult();
        }
        repository.save(IdempotencyRecord.builder()
                .id(key)
                .jobId(jobId)
                .action(action)
                .result(result)
                .createdAt(Instant.now())
                .build());
        return result;
    }
}
