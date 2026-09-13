create index if not exists federated_relay_messages_predecessor_idx
  on public.federated_relay_messages(predecessor_message_id)
  where predecessor_message_id is not null;

create index if not exists federated_relay_messages_reply_to_idx
  on public.federated_relay_messages(reply_to_message_id)
  where reply_to_message_id is not null;
