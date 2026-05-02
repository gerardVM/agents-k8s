# TOOLS.md — Local Notes

## Message Bus

Communicate via the agent-message-bus-api-service in your namespace.

- `POST http://agent-message-bus-api-service/send` — receive a message
  ```json
  {"from": "sender-id", "subject": "optional", "body": "instructions"}
  ```
- `GET http://agent-message-bus-api-service/inbox` — check your inbox
- `GET http://agent-message-bus-api-service/inbox?ack=<msgId>` — acknowledge a message
- `GET http://agent-message-bus-api-service/config` — check your config
- `POST http://agent-message-bus-api-service/config` — store your config

