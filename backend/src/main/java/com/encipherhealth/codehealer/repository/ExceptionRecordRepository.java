package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.ExceptionRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ExceptionRecordRepository extends MongoRepository<ExceptionRecord, String> {
    List<ExceptionRecord> findByStatusOrderByCreatedAtDesc(String status);

    long countByStatus(String status);
}
