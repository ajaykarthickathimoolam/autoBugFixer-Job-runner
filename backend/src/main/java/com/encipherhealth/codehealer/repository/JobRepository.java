package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.JobStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface JobRepository extends MongoRepository<Job, String> {
    List<Job> findByCreatedAtBetween(Instant from, Instant to);

    boolean existsByProjectIdAndTicketId(String projectId, String ticketId);

    List<Job> findByStatus(JobStatus status);

    long countByStatus(JobStatus status);
}
