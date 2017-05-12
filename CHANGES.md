# Unreleased

- [NEW] Moved to https://github.com/cloudant/couchbackup repository
- [NEW] API for using as library is more Node.js like.
- [BREAKING CHANGE] The --buffer option is now --buffer-size.
- [BREAKING CHANGE] The `writeerror` event is now just `error`.
- [BREAKING CHANGE] The `writecomplete` event is now `finished`.
- [BREAKING CHANGE] For restoring, the `written` event is now `restored`.
- [DEPRECATED] Previous API functions.
- [IMPROVED] Existence of the restore destination database is checked before
  starting the restore process.
- [FIXED] An issue where the process could exit before the backup content was
  completely flushed to the destination stream.
