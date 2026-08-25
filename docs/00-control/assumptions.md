# Assumptions

- This is a private, local-first tool for one operator, not a hosted SaaS.
- The first implementation should run as a local Web app before being wrapped as a desktop app.
- SSH should rely on the user's existing SSH config and keys; the app must not store private keys or passwords.
- The MVP should be useful even before real SSH is enabled, through safe simulated checks and dry-run actions.
- Real recovery remains off by default. The sole exception is a fixed, separately gated Nginx preflight/reload flow with fresh abnormal evidence, short-lived explicit approval, and post-action verification; every other mutation remains preview-only or forbidden.

