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
