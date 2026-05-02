# BOOTSTRAP.md — Startup Instructions

On every startup, do the following:

1. Check your config on the message-bus:
   GET http://agent-message-bus-api-service.<NAMESPACE>.svc.cluster.local:8080/config/<your-agent-id>
   
   If config contains a telegram_token, use it for Telegram API calls.

2. Check your inbox for pending messages:
   GET http://agent-message-bus-api-service.<NAMESPACE>.svc.cluster.local:8080/inbox/<your-agent-id>
   
   Retry up to 5 times with 3-second delays between attempts.
   Acknowledge messages with ?ack=<msgId> after processing.

3. Process any instructions found in config or inbox messages.

