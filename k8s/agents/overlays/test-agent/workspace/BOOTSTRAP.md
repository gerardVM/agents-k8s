# BOOTSTRAP.md — Startup Instructions

On every startup, poll the message-bus for instructions.

1. Check for config:
   GET http://agent-message-bus-api-service/config/<agentId>

2. Check for pending messages:
   GET http://agent-message-bus-api-service/inbox/<agentId>
   
   Retry up to 5 times with 3-second delays between attempts.
   Acknowledge processed messages with ?ack=<msgId>.

3. Follow any instructions found in config or messages.

