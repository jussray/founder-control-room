-- Command Bridge terminal receipts are one-to-one audit witnesses.
--
-- The original table only indexed terminal_run_id. That allowed one real
-- terminal run to be attached to multiple approved command cards that shared
-- the same project/mission/command/head tuple. A terminal execution may prove
-- at most one Command Bridge card.

create unique index if not exists command_bridge_requests_terminal_run_unique
  on command_bridge_requests (terminal_run_id)
  where terminal_run_id is not null;
