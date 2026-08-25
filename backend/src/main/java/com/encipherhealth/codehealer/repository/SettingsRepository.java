package com.encipherhealth.codehealer.repository;

import com.encipherhealth.codehealer.model.Settings;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface SettingsRepository extends MongoRepository<Settings, String> {
}
