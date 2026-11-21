## Android AI configuration fixes

- Keep API keys and custom request headers across Android restarts by default. The Remember on this device switch remains available; disabling it restores session-only storage. Saved values are stored locally without encryption and are not included in Android system backups.
- Preserve each configuration preset's own credentials when changing the storage mode. Keep provider and endpoint ownership checks and redact credentials from provider errors.
- Add Claude Code and Codex custom-provider options, based on Aharou's client-header presets. Claude Code selects Anthropic Messages; Codex selects OpenAI Responses at `/v1/responses` with an OpenAI-compatible Bearer API key. These options do not provide subscription login or authorization.
- Preserve manual header overrides when switching client presets, including after reopening settings. Previously saved configurations continue to use Chat Completions unless another protocol is explicitly selected.
- Support streaming text, usage and terminal events for the explicit protocols. Preserve length-limited responses as `finishReason: length`; reject interrupted or inconsistent event streams.

This is the first Android release of this Fork. Its fixed update channel is `qwerzxcva/storyforge`, and it uses the Fork's permanent signing certificate. It cannot replace an upstream-signed installation. Export a complete backup from the original app before migrating; do not uninstall an existing app before securing its data.

The release workflow requires complete non-browser and browser checks, native tests, exact APK source/payload verification, emulator installation, process restart, same-version signed replacement and backup restoration before publication. Same-version replacement does not establish an upgrade from an earlier Fork release. Real third-party service compatibility and physical-device behavior depend on the configured service and device.

Only Android is published. Attachments include the signed APK, SHA256SUMS.txt, public signing-certificate fingerprint and source-bound test receipt.
