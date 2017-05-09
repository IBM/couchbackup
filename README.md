# CouchBackup

[![Build Status](https://travis-ci.org/glynnbird/couchbackup.svg?branch=master)](https://travis-ci.org/glynnbird/couchbackup)

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

CouchBackup is a command-line utility that allows a Cloudant or CouchDB database to be backed up to a text file.
It comes with a companion command-line utility that can restore the backed up data.

**N.B.**

* **couchbackup does not do CouchDB replication as such, it simply streams through a database's `_changes` feed, and uses `POST /db/_bulk_get` to fetch the documents, storing the documents it finds on disk.**
* **couchbackup does not backup attachments, it is recommended to store attachments directly in an object store.**

## Installation

To install use npm:

```sh
npm install -g couchbackup
```

The minimum required Node.js version is 4.8.2.

## Usage

Either environment variables or command-line options can be used to specify the URL of the CouchDB or Cloudant instance, and the database to work with.

### The URL

To define the URL of the CouchDB instance set the `COUCH_URL` environment variable:

```sh
export COUCH_URL=http://localhost:5984
```
or

```sh
export COUCH_URL=https://myusername:mypassword@myhost.cloudant.com
```

Alternatively we can use the `--url` command-line parameter.

### The Database name

To define the name of the database to backup or restore, set the `COUCH_DATABASE` environment variable:

```sh
export COUCH_DATABASE=animaldb
```

Alternatively we can use the `--db` command-line parameter

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

You may also create a log file which records the progress of the backup with the `--log` parameter e.g.

```sh
couchbackup --db animaldb --log animaldb.log > animaldb.txt
```

This log file can be used to resume backups from where you left off with `--resume true`:

```sh
couchbackup --db animaldb --log animaldb.log --resume true >> animaldb.txt
```

You may also specify the name of the output file, rather than directing the backup data to *stdout*:

```sh
couchbackup --db animaldb --log animaldb.log --resume true --output animaldb.txt
```

## Restore

Now we have our backup text file, we can restore it to an existing database using the `couchrestore`:

```sh
cat animaldb.txt | couchrestore
```

or specifying the database name on the command-line:

```sh
cat animaldb.txt | couchrestore --db animaldb2
```

## Compressed backups

If we want to compress the backup data before storing to disk, we can pipe the contents through `gzip`:

```sh
couchbackup --db animaldb | gzip > animaldb.txt.gz
```

and restore the file with:

```sh
cat animaldb.tar.gz | gunzip | couchdbrestore --db animaldb2
```

## What's in a backup file?

A backup file is a text file where each line contains a JSON encoded array of up to 500 objects e.g.

```js
    [{"a":1},{"a":2}...]
    [{"a":501},{"a":502}...]
```

## What's in a log file?

A log file contains a line:

- for every batch of document ids that need to be fetched e.g. `:t batch56 [{"id":"a"},{"id":"b"}]`
- for every batch that has been fetched and stored e.g. `:d batch56`
- to indicate that the changes feed was fully consumed e.g. `:changes_complete`

## What is shallow mode?

When you run `couchbackup` with `--mode shallow` a simpler backup is performed, only backing up the winning revisions
of the database. No revision tokens are saved and any conflicting revisions are ignored. This is a faster, but less
complete backup. Shallow backups cannot be resumed because they do not produce a log file.

## Why use CouchBackup?

The easiest way to backup a CouchDB database is to copy the ".couch" file. This is fine on a single-node instance, but when running multi-node
Cloudant or using CouchDB 2.0 or greater, the ".couch" file only contains a single shard of data. This utility allows simple backups of CouchDB
or Cloudant database using the HTTP API.

This tool can be used to script the backup of your databases. Move the backup and log files to cheap Object Storage so that you have multiple copies of your precious data.

## Options reference

### Environment variables

* `COUCH_URL` - the URL of the CouchDB/Cloudant server e.g. `http://127.0.0.1:5984`
* `COUCH_DATABASE` - the name of the database to act upon e.g. `mydb` (default `test`)
* `COUCH_PARALLELISM` - the number of HTTP requests to perform in parallel when restoring a backup e.g. `10` (Default `5`)
* `COUCH_BUFFER_SIZE` - the number of documents fetched and restored at once e.g. `100` (default `500`)
* `COUCH_LOG` - the file to store logging information during backup
* `COUCH_RESUME` - if `true`, resumes a previous backup from its last known position
* `COUCH_OUTPUT` - the file name to store the backup data (defaults to stdout)
* `COUCH_MODE` - if `shallow`, only a superficial backup is done, ignoring conflicts and revision tokens. Defaults to `full` - a full backup.

### Command-line paramters

* `--url` - same as `COUCH_URL` environment variable
* `--db` - same as `COUCH_DATABASE`
* `--parallelism` - same as `COUCH_PARALLELISM`
* `--buffer` - same as `COUCH_BUFFER_SIZE`
* `--log` - same as `COUCH_LOG`
* `--resume` - same as `COUCH_RESUME`
* `--output` - same as `COUCH_OUTPUT`
* `--mode` - same as `COUCH_MODE`

## Exit Codes

On error, `couchbackup` and `couchrestore` will exit with non-zero exit codes. This section
details them.

### CouchBackup

* `1`: generic error (sorry if you see this one).

### CouchRestore

* `1`: generic error.
* `10`: restore target database does not exist.

## Using programmatically

You can use `couchbackup` programatically. First install
`couchbackup` into your project with `npm install --save couchbackup`.
Then you can import the library into your code:

```js
  const couchbackup = require('couchbackup');
```

The library exports two main functions:

1. `backup` - backup from a database to a writable stream.
2. `restore` - restore from a readable stream to a database.

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
* `log`: see `COUCH_LOG`.
* `resume`: see `COUCH_RESUME`.
* `mode`: see `COUCH_MODE`.

The callback has the standard `err, data` parameters and is called when
the backup completes or fails.

The `backup` function returns an event emitter. You can subscribe to:

* `written` - when a group of documents is backed up.
* `writecomplete` - emitted once when all documents are backed up.
* `writeerror` - emitted when something goes wrong for a single batch.

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
by the `backup` function. It uploads that to a Cloudant database, which
should be a **new** database.

```javascript
restore: function(srcStream, targetUrl, opts, callback) { /* ... */ }
```

The `opts` dictionary can contain values which map to a subset of the
environment variables defined above. Those related to the source and
target locations are not required.

* `parallelism`: see `COUCH_PARALLELISM`.
* `bufferSize`: see `COUCH_BUFFER_SIZE`.

The callback has the standard `err, data` parameters and is called when
the restore completes or fails.

The `restore` function returns an event emitter. You can subscribe to:

* `written` - when a group of documents is restored.
* `writecomplete` - emitted once when all documents are restored.
* `writeerror` - emitted when something goes wrong for a single batch.


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
