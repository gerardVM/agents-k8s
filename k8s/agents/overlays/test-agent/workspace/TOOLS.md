# TOOLS.md — Local Notes

## Message Bus

Communicate with other agents via the agent-message-bus-api-service in your namespace.

- `POST http://agent-message-bus-api-service/send` — send a message
  ```json
  {"to": "agent-id", "subject": "optional", "body": "instructions"}
  ```
- `GET http://agent-message-bus-api-service/inbox/<agentId>` — check inbox
- `GET http://agent-message-bus-api-service/inbox/<agentId>?ack=<msgId>` — acknowledge message
- `GET http://agent-message-bus-api-service/config/<agentId>` — check config
- `POST http://agent-message-bus-api-service/config/<agentId>` — store config

