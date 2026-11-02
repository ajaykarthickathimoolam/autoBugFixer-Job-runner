package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.KnowledgeDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface KnowledgeDocumentRepository extends MongoRepository<KnowledgeDocument, String> {
    List<KnowledgeDocument> findByProjectIdOrderByUpdatedAtDesc(String projectId);
}
