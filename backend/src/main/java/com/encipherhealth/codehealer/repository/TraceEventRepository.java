package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.TraceEvent;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface TraceEventRepository extends MongoRepository<TraceEvent, String> {
    List<TraceEvent> findByJobIdOrderByTimestampAsc(String jobId);
}
