ALTER TABLE "PriceRefreshRun"
  DROP CONSTRAINT "PriceRefreshRun_status_check",
  ADD CONSTRAINT "PriceRefreshRun_status_check"
    CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'ABORTED', 'PAUSED'));
