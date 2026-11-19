## Custom request headers

This Android Fork adds optional custom HTTP headers to the Custom AI provider. Configure header names and values in Settings. Custom values override same-name defaults without regard to case. The configuration is used for model discovery, connection tests, capacity discovery, streaming, ordinary chat and image chat.

Header values are masked in settings and follow the existing Remember on this device setting. Provider changes clear the headers, stale model-discovery results are discarded, connection logs redact values, and requests carrying custom headers refuse automatic redirects.

Android update checks use qwerzxcva/storyforge. This Fork has its own permanent signing certificate and cannot replace an upstream-signed installation. Export a complete backup from the original app before migrating. Do not uninstall an existing app before securing its data.

This is the first Android release of this Fork. Release CI verifies the APK's exact source and payload, native tests, installation, process restart, same-version signed replacement and production backup restoration on an Android emulator. This does not claim an upgrade from an earlier Fork version, coverage of every physical device, or compatibility with a real third-party gateway. CORS and provider-specific header restrictions still depend on the service used.

Only Android is published. The APK, SHA256SUMS.txt, public signing certificate fingerprint and source-bound test receipt are attached.
