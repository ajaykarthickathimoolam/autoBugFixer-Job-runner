# autoBugFixer-Job-runner
Isolated CodeHealer worker: clones service repos, asks Guard before each action, runs GPT or Claude to plan/fix a ticket, verifies with build/tests and security scans, then opens a review-only GitHub PR. Never merges.
