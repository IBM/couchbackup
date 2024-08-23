# CouchBackup

[![npm (scoped)](https://img.shields.io/npm/v/@cloudant/couchbackup.svg?colorB=0000ff)](https://www.npmjs.com/package/@cloudant/couchbackup)
[![npm (scoped with tag)](https://img.shields.io/npm/v/@cloudant/couchbackup/snapshot.svg?colorB=666699)](https://www.npmjs.com/package/@cloudant/couchbackup)

```
 _____                  _    ______            _
/  __ \                | |   | ___ \          | |
| /  \/ ___  _   _  ___| |__ | |_/ / __ _  ___| | ___   _ _ __
| |    / _ \| | | |/ __| '_ \| ___ \/ _` |/ __| |/ / | | | '_ \
| \__/\ (_) | |_| | (__| | | | |_/ / (_| | (__|   <| |_| | |_) |
 \____/\___/ \__,_|\___|_| |_\____/ \__,_|\___|_|\_\\__,_| .__/
                                                         | |
                                                         |_|
```

CouchBackup is a command-line utility that backs up a Cloudant or CouchDB database to a text file.
It comes with a companion command-line utility that can restore the backed up data.

## Limitations

CouchBackup has some restrictions in the data it's able to backup:

* **`couchbackup` does not do CouchDB replication as such, it simply streams through a database's `_changes` feed, and uses `POST /db/_bulk_get` to fetch the documents, storing the documents it finds on disk.**
* **`couchbackup` does not support backing up or restoring databases containing documents with attachments. The recommendation is to store attachments directly in an object store. The "attachments" option is provided as-is and is not supported. This option is for Apache CouchDB only and is experimental. DO NOT USE THIS OPTION WITH IBM Cloudant backups.** [Note](#note-on-attachments)

## Installation

To install the latest released version use npm:

```sh
npm install -g @cloudant/couchbackup
```

### Requirements
* Node.js LTS version 18 or 20.
* The minimum required CouchDB version is 2.0.0.

### Snapshots

The latest builds of the `main` branch are available on npm with the `snapshot` tag. Use the `snapshot` tag if you want to experiment with an unreleased fix or new function, but please note that snapshot versions are **not supported**.

## Usage

Use either environment variables or command-line options to specify the URL of the CouchDB or Cloudant instance, and the database to work with.

### The URL

To define the URL of the CouchDB instance set the `COUCH_URL` environment variable:

```sh
export COUCH_URL=http://localhost:5984
```
or

```sh
export COUCH_URL=https://myusername:mypassword@myhost.cloudant.com
```

Or use the `--url` command-line parameter.

When passing credentials in the user information subcomponent of the URL
they must be [percent encoded](https://tools.ietf.org/html/rfc3986#section-3.2.1).
Specifically, within either the username or password, the characters `: / ? # [ ] @ %`
_MUST_ be precent-encoded, other characters _MAY_ be percent-encoded.

For example, for the username `user123` and password `colon:at@321`:
```
https://user123:colon%3aat%40321@localhost:5984
```

Note take extra care to escape shell reserved characters when
setting the environment variable or command-line parameter.

### The Database name

To define the name of the database to backup or restore, set the `COUCH_DATABASE` environment variable:

```sh
export COUCH_DATABASE=animaldb
```

Or use the `--db` command-line parameter

## Backup

To backup a database to a text file, use the `couchbackup` command, directing the output to a text file:

```sh
couchbackup > backup.txt
```

Another way of backing up is to set the `COUCH_URL` environment variable only and supply the database name on the command-line:

```sh
couchbackup --db animaldb > animaldb.txt
```

## Logging & resuming backups

You may also create a log file which records the progress of the backup with the `--log` parameter, for example:

```sh
couchbackup --db animaldb --log animaldb.log > animaldb.txt
```

Use this log file to resume backups with `--resume true`:

```sh
couchbackup --db animaldb --log animaldb.log --resume true >> animaldb.txt
```

The `--resume true` option works for a backup that has finished spooling changes, but has not yet completed downloading all the necessary batches of documents. It _is not an incremental backup_ solution.

You may also specify the name of the output file, rather than directing the backup data to *stdout*:

```sh
couchbackup --db animaldb --log animaldb.log --resume true --output animaldb.txt
```

### Compatibility note

When using `--resume` use the same version of `couchbackup` that started the backup.

## Restore

Now restore the backup text file to a new, empty, existing database using the `couchrestore`:

```sh
cat animaldb.txt | couchrestore
```

or specifying the database name on the command-line:

```sh
cat animaldb.txt | couchrestore --db animaldb2
```

### Compatibility note

**Do not use an older version of `couchbackup` to restore a backup created with a newer version.**

Newer versions of `couchbackup` can restore backups created by older versions within the same major version.

## Compressed backups

To compress the backup data before storing to disk pipe the contents through `gzip`:

```sh
couchbackup --db animaldb | gzip > animaldb.txt.gz
```

and restore the file with:

```sh
cat animaldb.tar.gz | gunzip | couchdbrestore --db animaldb2
```

## Encrypted backups

Similarly to compression it is possible to pipe the backup content through an
encryption or decryption utility. For example with `openssl`:

```sh
couchbackup --db animaldb | openssl aes-128-cbc -pass pass:12345 > encrypted_animal.db
```

```sh
openssl aes-128-cbc -d -in encrypted_animal.db -pass pass:12345 | couchrestore --db animaldb2
```

Note that the content is not encrypted in the
backup tool before piping to the encryption utility.

## What's in a backup file?

A backup file is a text file where each line is either a JSON object of backup metadata
or a JSON array of backed up document revision objects, for example:

```json
{"name":"@cloudant/couchbackup","version":"2.9.10","mode":"full"}
[{"_id": "1","a":1},{"_id": "2","a":2},...]
[{"_id": "501","a":501},{"_id": "502","a":502}]
```

The number of document revisions in a backup array varies. It typically has
`buffer_size` elements, but may be more if there are also leaf revisions returned
from the server or fewer if it is the last batch.

## What's in a log file?

A log file has a line:

- for every batch of document ids that `couchbackup` needs to fetch, for example: `:t batch56 [{"id":"a"},{"id":"b"}]`
- for every batch that `couchbackup` has fetched and stored, for example: `:d batch56`
- to indicate that the changes feed was fully consumed, for example: `:changes_complete`

## What's shallow mode?

When you run `couchbackup` with `--mode shallow` `couchbackup` performs a simpler backup.
It only backs up the winning revisions and ignores any conflicting revisions.
This is a faster, but less complete backup.

_Note:_ The `--log`,  `--resume`, and `--parallelism` are invalid for `--mode shallow` backups.

## Why use CouchBackup?

The easiest way to backup a CouchDB database is to copy the ".couch" file. This is fine on a single-node instance, but when running multi-node
Cloudant or using CouchDB 2.0 or greater, the ".couch" file only has a single shard of data. This utility allows simple backups of CouchDB
or Cloudant database using the HTTP API.

This tool can script the backup of your databases. Move the backup and log files to cheap Object Storage so that you have copies of your precious data.

## Options reference

### Environment variables

* `COUCH_URL` - the URL of the CouchDB/Cloudant server, for example: `http://127.0.0.1:5984`
* `COUCH_DATABASE` - the name of the database to act upon, for example: `mydb` (default `test`)
* `COUCH_PARALLELISM` - the number of HTTP requests to perform in parallel when restoring a backup, for example: `10` (Default `5`)
* `COUCH_BUFFER_SIZE` - the number of documents fetched and restored at once, for example: `100` (default `500`).
* `COUCH_REQUEST_TIMEOUT` - the number of milliseconds to wait for a response to a HTTP request before retrying the request, for example: `10000` (Default `120000`)
* `COUCH_LOG` - the file to store logging information during backup
* `COUCH_RESUME` - if `true`, resumes an earlier backup from its last known position (requires a log file)
* `COUCH_OUTPUT` - the file name to store the backup data (defaults to stdout)
* `COUCH_MODE` - if `shallow`, does only a superficial backup ignoring conflicts. Defaults to `full` - a full backup.
* `COUCH_QUIET` - if `true`, suppresses the individual batch messages to the console during CLI backup and restore
* `CLOUDANT_IAM_API_KEY` - optional [IAM API key](https://console.bluemix.net/docs/services/Cloudant/guides/iam.html#ibm-cloud-identity-and-access-management)
 to use to access the Cloudant database instead of user information credentials in the URL. The endpoint used to retrieve the token defaults to
 `https://iam.cloud.ibm.com/identity/token`, but can be overridden if necessary using the `CLOUDANT_IAM_TOKEN_URL` environment variable.
* `COUCH_ATTACHMENTS` - _EXPERIMENTAL & UNSUPPORTED_ (see [Note](#note-on-attachments)) if `true` will include attachments as part of the backup or restore process.
* `DEBUG` - if set to `couchbackup`, all debug messages print on `stderr` during a backup or restore process

_Note:_ Environment variables are only used with the CLI. When
[using programmatically](#using-programmatically) use the `opts` dictionary.

### Command-line parameters

* `--url` - same as `COUCH_URL` environment variable
* `--db` - same as `COUCH_DATABASE`
* `--parallelism` - same as `COUCH_PARALLELISM`
* `--buffer-size` - same as `COUCH_BUFFER_SIZE`
* `--request-timeout` - same as `COUCH_REQUEST_TIMEOUT`
* `--log` - same as `COUCH_LOG`
* `--resume` - same as `COUCH_RESUME`
* `--output` - same as `COUCH_OUTPUT`
* `--mode` - same as `COUCH_MODE`
* `--iam-api-key` - same as `CLOUDANT_IAM_API_KEY`
* `--quiet` - same as `COUCH_QUIET`
* `--attachments` - _EXPERIMENTAL & UNSUPPORTED_ (see [Note](#note-on-attachments)) same as `COUCH_ATTACHMENTS`

## Using programmatically

You can use `couchbackup` programmatically. First install
`couchbackup` into your project with `npm install --save @cloudant/couchbackup`.
Then you can import the library into your code:

```js
  const couchbackup = require('@cloudant/couchbackup');
```

The library exports two main functions:

1. `backup` - backup from a database to a writable stream.
2. `restore` - restore from a readable stream to an empty database.

### Examples

See [the examples folder](./examples) for example scripts showing how to
use the library.

### Backup

The `backup` function takes a source database URL, a stream to write to,
backup options and a callback for completion.

```javascript
backup: function(srcUrl, targetStream, opts, callback) { /* ... */ }
```

The `opts` dictionary can contain values which map to a subset of the
environment variables defined above. Those related to the source and
target locations are not required.

* `parallelism`: see `COUCH_PARALLELISM`.
* `bufferSize`: see `COUCH_BUFFER_SIZE`.
* `requestTimeout`: see `COUCH_REQUEST_TIMEOUT`.
* `log`: see `COUCH_LOG`.
* `resume`: see `COUCH_RESUME`.
* `mode`: see `COUCH_MODE`.
* `iamApiKey`: see `CLOUDANT_IAM_API_KEY`.
* `iamTokenUrl`: optionally used with `iamApiKey` to override the default URL for
 retrieving IAM tokens.
* `attachments`: _EXPERIMENTAL & UNSUPPORTED_ (see [Note](#note-on-attachments)), see `CLOUDANT_ATTACHMENTS`.

When the backup completes or fails the callback functions gets called with
the standard `err, data` parameters.

The `backup` function returns an event emitter. You can subscribe to:

* `changes` - when a batch of changes has been written to log stream.
* `written` - when a batch of documents has been written to backup stream.
* `finished` - emitted once when all documents are backed up.

Backup data to a stream:

```javascript
couchbackup.backup(
  'https://examples.cloudant.com/animaldb',
  process.stdout,
  {parallelism: 2},
  function(err, data) {
    if (err) {
      console.error("Failed! " + err);
    } else {
      console.error("Success! " + data);
    }
  });
```

Or to a file:

```javascript
couchbackup.backup(
  'https://examples.cloudant.com/animaldb',
  fs.createWriteStream(filename),
  {parallelism: 2},
  function(err, data) {
    if (err) {
      console.error("Failed! " + err);
    } else {
      console.error("Success! " + data);
    }
  });
```

### Restore

The `restore` function takes a readable stream containing the data emitted
by the `backup` function and uploads that to a Cloudant database.

_Note:_ A target database must be a **new and empty** database.

```javascript
restore: function(srcStream, targetUrl, opts, callback) { /* ... */ }
```

The `opts` dictionary can contain values which map to a subset of the
environment variables defined above. Those related to the source and
target locations are not required.

* `parallelism`: see `COUCH_PARALLELISM`.
* `bufferSize`: see `COUCH_BUFFER_SIZE`.
* `requestTimeout`: see `COUCH_REQUEST_TIMEOUT`.
* `iamApiKey`: see `CLOUDANT_IAM_API_KEY`.
* `iamTokenUrl`: optionally used with `iamApiKey` to override the default URL for
 retrieving IAM tokens.
* `attachments`: _EXPERIMENTAL & UNSUPPORTED_ (see [Note](#note-on-attachments)), see `CLOUDANT_ATTACHMENTS`.

When the restore completes or fails the callback functions gets called with
the standard `err, data` parameters.

The `restore` function returns an event emitter. You can subscribe to:

* `restored` - when a batch of documents is restored.
* `finished` - emitted once when all documents are restored.

The `srcStream` for the restore is a [backup file](#whats-in-a-backup-file).
In the case of an incomplete backup the file could be corrupt and in that
case the restore emits a `BackupFileJsonError`.

Restore data from a stream:

```javascript
couchbackup.restore(
  process.stdin,
  'https://examples.cloudant.com/new-animaldb',
  {parallelism: 2},
  function(err, data) {
    if (err) {
      console.error("Failed! " + err);
    } else {
      console.error("Success! " + data);
    }
  });
```

Or from a file:

```javascript
couchbackup.restore(
  fs.createReadStream(filename),
  'https://examples.cloudant.com/new-animaldb',
  {parallelism: 2},
  function(err, data) {
    if (err) {
      console.error("Failed! " + err);
    } else {
      console.error("Success! " + data);
    }
  });
```

## Error Handling

The `couchbackup` and `couchrestore` processes are able to tolerate many errors even over an unreliable network.
Failed requests retry at least twice after a back-off delay.
However, certain errors can't tolerate failures:
- invalid configuration
- failed validation checks (for example: auth, database existence, `_bulk_get` endpoint avaialbility)

### API

When using the library programmatically in the case of a fatal error
the callback function gets called with `null, error` arguments.

### CLI Exit Codes

On fatal errors, `couchbackup` and `couchrestore` exit with non-zero exit codes. This section
details them.

### common to both `couchbackup` and `couchrestore`

* `1`: unknown CLI option or generic error.
* `2`: invalid CLI option.
* `10`: backup source or restore target database does not exist.
* `11`: unauthorized credentials for the database.
* `12`: invalid permissions for the database.
* `40`: database returned a fatal HTTP error.

### `couchbackup`

* `20`: `--resume` without a log file.
* `21`: the resume log file does not exist.
* `22`: incomplete changes in log file.
* `23`: the log file already exists, but `--resume` was not used.
* `30`: error spooling changes from the database.
* `50`: source database does not support `/_bulk_get` endpoint.

### `couchrestore`

* `13`: restore target database is not new and empty.
* `60`: `attachments` option used for backup, but wasn't used for restore.
* `61`: `attachments` option used for restore, but wasn't used for backup.

## Note on attachments

TLDR; If you backup a database that has attachments without using the `attachments` option `couchbackup` can't restore it.

As documented above `couchbackup` does not support backing up or restoring databases containing documents with attachments.

The recommendation is to store attachments directly in an object store with a link in the JSON document instead of using the
native attachment API.

### With experimental `attachments` option

The `attachments` option is provided as-is and is not supported. This option is for Apache CouchDB only and is experimental. Do not use this option with IBM Cloudant backups.

### Without experimental `attachments` option

Backing up a database that includes documents with attachments appears to complete successfully. However, the attachment
content is not downloaded and the backup file contains attachment metadata. So attempts to
restore the backup result in errors because the attachment metadata references attachments that are not present
in the restored database.
