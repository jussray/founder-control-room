\set ON_ERROR_STOP on
-- Reuse the canonical v5 source-backed fixture and its existing assertions.
-- Enabling v6 applies this unchanged migration before the v5 runtime proof
-- and then rejects NULL metric direction before rolling everything back.
\set VERIFY_LEARNING_V6 true
\ir 20261106201500_learning_os_metric_evidence_v5.sql
