package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.IdempotencyRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface IdempotencyRecordRepository extends MongoRepository<IdempotencyRecord, String> {
}
