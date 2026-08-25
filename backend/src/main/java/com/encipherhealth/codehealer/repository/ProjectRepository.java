package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.Project;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProjectRepository extends MongoRepository<Project, String> {
}
