# Unreleased
- [NOTE] Updated Node.js version requirement statement for LTS 24.

# 2.11.11 (2025-10-20)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.10`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `5.4.3` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.12.2` to match version provided from `ibm-cloud-sdk-core`.

# 2.11.10 (2025-08-29)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.8`.

# 2.11.9 (2025-07-25)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.7`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `5.4.2` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.11.0` to match version provided from `ibm-cloud-sdk-core`.

# 2.11.8 (2025-07-23)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.6`.
- [NOTE] Add AI code policy to contributing guide.

# 2.11.7 (2025-06-20)
- [IMPROVED] Added and improved existing examples.
- [UPGRADED] `commander` dependency to version `14.0.0`
- [UPGRADED] `debug` dependency to version `4.4.1`.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.4`.

# 2.11.6 (2025-05-01)
- [IMPROVED] Avoid poll delay collecting changes from empty databases.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.3`.
- [NOTE] Updated minimum supported engine to Node.js 20 LTS.

# 2.11.5 (2025-03-11)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.2`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `5.3.2` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.8.2` to match version provided from `ibm-cloud-sdk-core`.

# 2.11.4 (2025-02-11)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.1`.

# 2.11.3 (2025-01-23)
- [FIXED] Encoding of special characters in database names.
- [UPGRADED] `commander` dependency to version `13.1.0`

# 2.11.2 (2025-01-16)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.12.0`.
- [UPGRADED] `commander` dependency to version `13.0.0`
- [UPGRADED] `debug` dependency to version `4.4.0`.

# 2.11.1 (2024-11-19)
- [FIXED] Error messages from retried requests.
- [IMPROVED] Updated error response messages.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.11.0`.
- [NOTE] Removed `retry-axios` from peerDependencies.
- [NOTE] Updated Node.js version requirement statement for LTS 22.

# 2.11.0 (2024-09-24)
- [NEW] *EXPERIMENTAL/UNSUPPORTED* Add `attachments` option to backup and restore attachments for Apache CouchDB.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.10.3`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `5.0.2` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `debug` dependency to version `4.3.7`.
- [NOTE] The `attachments` option is not supported. Do not use for IBM Cloudant backups.

# 2.10.2 (2024-08-19)

- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.10.1`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `5.0.1` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.7.4` to match version provided from `ibm-cloud-sdk-core`.
- [UPGRADED] `commander` dependency to version `12.1.0`
- [UPGRADED] `debug` dependency to version `4.3.6`.

# 2.10.1 (2024-05-14)
- [IMPROVED] Updated documentation.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.9.1`.

# 2.10.0 (2024-02-28)
- [NEW] Included `time` in `restored` API events and CLI output.
- [NEW] Added metadata to backup files.
- [FIXED] Double output of errors to stderr when using CLI.
- [FIXED] Error for broken JSON in backup files.
- [FIXED] Wrong error code used for incomplete changes item.
- [FIXED] Error if the log file already exists when starting a new backup.
- [REMOVED] Dependency on `async` module.
- [REMOVED] Dependency on `tmp` module.
- [REMOVED] Unused request handling code.
- [IMPROVED] Increased tolerance to server and network errors when spooling changes (via cloudant-node-sdk changes follower).
- [IMPROVED] Avoided double parsing of JSON batches when resuming a backup.
- [IMPROVED] Resumed backups identification of incomplete backup lines during restore.
- [IMPROVED] Added line numbers to errors from reading backup or log files.
- [IMPROVED] Replace custom liner with Node built-in readline.
- [IMPROVED] Added warning that `--buffer-size` has no effect with `--resume`.
- [IMPROVED] Documentation about compatibility.
- [IMPROVED] Resolved linter warnings.
- [IMPROVED] Internal enhancements with promises and pipelines replacing callbacks and event emitters.
- [IMPROVED] Added new test cases and improved test stability.
- [NOTE] Versions older than 2.10.0 cannot restore backups created with 2.10.0. See [compatibility note](README.md#compatibility-note-1).

# 2.9.17 (2024-02-14)
- [IMPROVED] Examples and related documentation.
- [IMPROVED] Reduced package size.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.8.3`.
- [UPGRADED] `commander` dependency to version `12.0.0`
- [UPGRADED] Examples to use latest dependencies.

# 2.9.16 (2024-01-10)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.8.2`.

# 2.9.15 (2023-12-04)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.8.0`.
- [NOTE] Updated Node.js version requirement statement for LTS 18 and 20.

# 2.9.14 (2023-11-02)
- [FIXED] Corrected error handling for invalid URLs.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.7.2`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `4.1.4` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.6.0` to match version provided from `ibm-cloud-sdk-core`.

# 2.9.13 (2023-09-28)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.7.1`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `4.1.2` to match version provided from `@ibm-cloud/cloudant`.
- [NOTE] Updated minimum supported engine to Node.js 18 `hydrogen` LTS.

# 2.9.12 (2023-09-04)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.6.0`.

# 2.9.11 (2023-06-29)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.5.4`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `4.0.9` to match version provided from `@ibm-cloud/cloudant`.

# 2.9.10 (2023-06-09)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.5.2`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `4.0.8` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.4.0` to match version provided from `ibm-cloud-sdk-core`.
- [NOTE] Repository moved from https://github.com/cloudant/couchbackup to https://github.com/IBM/couchbackup.
- [NOTE] Updated Node.js version requirement statement for LTS 16 and 18.

# 2.9.9 (2023-05-03)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.5.1`.
- [NOTE] Updated minimum supported engine to Node.js 16 `gallium` LTS.

# 2.9.8 (2023-04-04)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.5.0`.

# 2.9.7 (2023-02-27)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.4.1`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to version `4.0.3`.

# 2.9.6 (2023-01-06)
- [FIXED] HTTP client dependency issue that masked backup errors when server connection was dropped.
- [FIXED] Discard temporary file descriptor for backup.
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.4.0`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to minimum version `4.0.2` to match version provided from `@ibm-cloud/cloudant`.
- [UPGRADED] `axios` peerDependency to minimum version `1.2.1` to match version provided from `ibm-cloud-sdk-core`.

# 2.9.5 (2022-11-01)
- [UPGRADED]  `@ibm-cloud/cloudant` dependency to version `0.3.0`.

# 2.9.4 (2022-10-05)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.2.1`.
- [NOTE] Add `axios` to peerDependencies.

# 2.9.3 (2022-09-08)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.2.0`.

# 2.9.2 (2022-08-02)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.1.5`.
- [UPGRADED] `ibm-cloud-sdk-core` peerDependency to version `3.1.0`.

# 2.9.1 (2022-07-19)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.1.4`.

# 2.9.0 (2022-05-09)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.1.2`.
- [NOTE] Updated minimum supported engine to Node.js 14 `fermium` LTS.

# 2.8.3 (2022-04-05)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.1.1`.
- [NOTE] Move `retry-axios` and `ibm-cloud-sdk-core` to peerDependencies.

# 2.8.2 (2022-02-10)
- [UPGRADED] `@ibm-cloud/cloudant` dependency to version `0.0.24`.

# 2.8.1 (2021-12-02)
- [FIXED] Regression from version 2.7 resulting in incorrect handling of percent-encoded credentials in the URL user-info.

# 2.8.0 (2021-11-25)
- [FIXED] Corrected `user-agent` header on requests.
- [FIXED] Restore of shallow backups created with versions <=2.4.2.
- [IMPROVED] Added quiet option to backup and restore to suppress batch messages.
- [IMPROVED] Added a preflight check for restore function to make sure that a target database is new and empty.
- [IMPROVED] Added handling for errors reading log file.
- [IMPROVED] Split changes spooling to improve reliability on databases with
  millions of documents.
- [UPGRADED] `@ibm-cloud/cloudant`, `commander` and `debug` dependencies.

# 2.7.0 (2021-09-14)
- [UPGRADED] Cloudant client dependency from `@cloudant/cloudant` to `@ibm-cloud/cloudant`.

# 2.6.2 (2021-08-27)
- [FIXED] `Invalid document ID: _bulk_get` error when using `@cloudant/cloudant`
  version `4.5.0`.
- [UPGRADED] Upgraded `@cloudant/cloudant` dependency to version `4.5.0`.
- [NOTE] Updated minimum supported engine to Node.js 12 `erbium` LTS.

# 2.6.1 (2021-06-23)
- [FIXED] Async queue pause/resume behaviour to avoid exhausting listener handles.
- [UPGRADED] Upgraded `@cloudant/cloudant` dependency to version `4.4.0`.

# 2.6.0 (2020-09-22)
- [FIXED] Invalid parameters error when using shallow mode.
- [UPGRADED] Upgraded `@cloudant/cloudant` dependency to version `4.3.0`.
- [NOTE] Updated minimum supported engine to Node.js 10 `dubnium` LTS.

# 2.5.2 (2020-03-02)
- [FIXED] Issue with compatibility with Nano 8.2.0.

# 2.5.1 (2019-12-06)
- [FIXED] Issue with incorrect handling of percent-encoded user info characters
  via @cloudant/cloudant dependency.
- [UPGRADED] Upgraded @cloudant/cloudant dependency to minimum version 4.2.3
- [IMPROVED] Added documentation around encoding of characters in the user info
  subcomponent of the URL.

# 2.5.0 (2019-10-24)
- [UPGRADED] Upgraded @cloudant/cloudant dependency to version 4.2.2.
- [NOTE] Updated minimum supported engine to Node.js 8 “Carbon” LTS.

# 2.4.2 (2019-08-20)

- [FIXED] Preserve document revisions in shallow backup.
- [UPGRADED] Upgraded commander dependency to version 3.0.0.

# 2.4.1 (2019-06-18)

- [FIXED] Removed inadvertent npm-cli-login dependency.
- [UPGRADED] Upgraded @cloudant/cloudant dependency to version 4.1.1.
- [UPGRADED] Upgraded async dependency to version 3.0.1.

# 2.4.0 (2019-03-15)

- [NEW] Added request timeout option. Set via env var `COUCH_REQUEST_TIMEOUT`,
 as CLI option `--request-timeout`, or programmatically via
 `options.requestTimeout`.
- [IMPROVED] Replaced usages of Node.js legacy URL API. Note this changes some
  URL validation error messages.
- [IMPROVED] Documentation, help text and log warnings for invalid options in
  "shallow" mode.
- [UPGRADED] Moved nodejs-cloudant dependency to 4.x.x.

# 2.3.1 (2018-06-15)

- [FIXED] Concurrent database backups use the same default log file.
- [FIXED] IAM token URL override option.

# 2.3.0 (2018-05-22)

- [NEW] Check for database existence before starting backup. This provides for
 better error messages for existence, authentication, and `_bulk_get` problems.
- [FIXED] Intermittent issues with multiple callbacks, particularly noticeable
 when using Node.js 10.
- [FIXED] Issue where a success message could confusingly be output after a
 fatal error.
- [UPGRADED] Increased nodejs-cloudant dependency minimum to 2.2.x.

# 2.2.0 (2018-03-06)

- [FIXED] An issue where the `_changes` response stream doesn't get correctly
  decompressed.
- [FIXED] Prevent duplicate execution of backup error callbacks.
- [NOTE] Update engines in preparation for Node.js 4 “Argon” end-of-life.

# 2.1.0 (2018-02-20)

- [NEW] Added API for upcoming IBM Cloud Identity and Access Management support
  for Cloudant on IBM Cloud. Note: IAM API key support is not yet enabled in the
  service.
- [IMPROVED] Enhanced resilience of backup and restore processes by enabling the
  nodejs-cloudant retry plugin.
- [IMPROVED] Added URL validation for presence of host and database elements.
- [UPGRADED] Increased nodejs-cloudant dependency to 2.x.

# 2.0.1 (2018-01-11)

- [NEW] Changed to use nodejs-cloudant for database requests.
- [IMPROVED] Added compression to restore process requests.
- [FIXED] An unhandled `readstream.destroy is not a function` error when trying
  to terminate a restore process that encountered an error.
- [UPGRADED] Increased debug dependency to 3.0.x.

# 2.0.0 (2017-07-04)

- [NEW] Moved to https://github.com/cloudant/couchbackup repository.
- [NEW] Validate backup/restore options.
- [NEW] Add User-Agent header to all requests.
- [NEW] Added unique CLI exit codes for known error conditions.
- [NEW] API for using as library that is more Node.js-like.
- [NEW] Added `changes` event for each batch spooled from the changes feed.
- [BREAKING CHANGE] The --buffer option is now --buffer-size.
- [BREAKING CHANGE] The `writeerror` event is now just `error`.
- [BREAKING CHANGE] The `writecomplete` event is now `finished`.
- [BREAKING CHANGE] For restoring, the `written` event is now `restored`.
- [REMOVED] Removed legacy 1.x API.
- [IMPROVED] Verify database supports `/_bulk_get` endpoint prior to running backup.
- [IMPROVED] Existence of the restore destination database is checked before
  starting the restore process.
- [IMPROVED] Added compression for backup HTTP responses, where supported by the
  server.
- [IMPROVED] Added HTTP persistent connection pools corresponding to the backup
  parallelism.
- [IMPROVED] Better error handling in couchrestore when remote database
  cannot be written to.
- [IMPROVED] Validate HTTP responses when restoring a database.
- [IMPROVED] Aborts backup and restore processes for known irrecoverable errors.
- [IMPROVED] Retry restore batches on transient errors.
- [FIXED] An issue where the process could exit before the backup content was
  completely flushed to the destination stream.
- [FIXED] An issue where back pressure on the output stream was ignored
  potentially resulting in the backup process running out of memory.
- [FIXED] An issue where the log entry could be written for a batch before the
  batch was written to the backup file.
- [FIXED] An issue where a restore of a resumed backup might not complete due to
  incomplete JSON entries in the backup file.
- [FIXED] An issue where an empty batch could be written to the backup file.
- [FIXED] An issue where the restore-time buffer size was ignored.
- [FIXED] Ensure body 'rows' key exists before performing shallow backup.
- [FIXED] An issue where write errors were not correctly reported.
- [FIXED] An issue where couchbackup would attempt to write to an
  invalid output file.
