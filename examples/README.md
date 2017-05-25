# CouchBackup Examples

This folder contains Node.js scripts which use the `couchbackup` library.

Use `npm install` in this folder to install the script dependencies.

Run a script without arguments to receive help.

## Current examples

### IBM Cloud Object Store S3 API / AWS S3

1. `s3-backup-file.js` -- backup a database to an S3-API compatible store
    using a intermediate file on disk to store the backup before upload.
2. `s3-backup-stream.js` -- backup a database to an S3-API compatible store
    by streaming the backup data directly from CouchDB or Cloudant into
    an object.
