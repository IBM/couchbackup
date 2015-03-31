# CouchBackup

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

CouchBackup is a command-line utility that allows a CouchDB database to be backed-up to a text file. 
It comes with a companion command-line utility that can restore the backed up data.

## Installation

To install use npm:

    npm install -g couchbackup

## Usage

Either environement variables or command-line options can be used to specify the URL of the CouchDB or Cloudant instance, and the database to work with.

### The URL

To define the URL of the CouchDB instance set the COUCH_URL environment variable:

    export COUCH_URL=http://localhost:5984

or

    export COUCH_URL=https://myusername:mypassword@myhost.cloudant.com

Alternatively we can use the `--url` command-line parameter.

### The Database name

To define the name of the database to backup or restore, set the COUCH_DATABASE environment variable:

    export COUCH_DATABASE=animals

Alternatively we can use the `--db` command-line parameter

## Backup

To backup a database to a text file, use the `couchbackup` command, directing the output to a text file:

    couchbackup > backup.txt

Another way of backing up is to set the COUCH_URL environment variable only and supply the database name on the command-line:

    couchbackup --db animals > animals.txt
  
## Restore

Now we have our backup text file, we can restore it to an existing database using the `couchrestore`:

    cat animals.txt | couchrestore

or specifying the database name on the command-line:

    cat animals.txt | couchrestore --db animalsdb


## Compressed backups

If we want to compress the backup data before storing to disk, we can pipe the contents through `gzip`:

    couchbackup --db animals | gzip > animals.txt.gz

and restore the file with:

    cat animals.tar.gz | gunzip | couchdbrestore --db animals2

## What's in a backup file?

A backup file is a text file where each line contains a JSON encoded array of up to 500 objects e.g.

    [{"a":1},{"a":2}...]
    [{"a":501},{"a":502}...]


