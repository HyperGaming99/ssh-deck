# Branches and releases

- **`dev`** – work happens here (or in feature branches that open a pull request into `dev`). Every push to `dev` runs the tests, bumps the patch version automatically if needed, builds installers for Linux, Windows and macOS and publishes them as a **pre-release** (`v<version>-dev.<run>`). Only the 10 newest dev builds are kept.
- **`main`** – stable. Direct pushes are blocked; changes arrive by pull request from `dev`. Merging publishes the stable release `v<version>` (skipped if that version already exists).
- Installer file names: `ssh-deck-<version>-<last commit>-<os>-<arch>.<ext>`.
- The release notes list every commit since the previous release and name the last commit.
- Installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn on first start.
