#!/usr/bin/env node
var config = require('../includes/config.js'),
  couchbackup = require('../app.js');

couchbackup.backup(config.COUCH_URL, config.COUCH_DATABASE, config.COUCH_BUFFER_SIZE)
  .on("written", function(obj) {
    process.stderr.write(" backed up docs: " + obj.total + "\r");
    process.stdout.write(JSON.stringify(obj.data) + "\n");
  })
  .on("writecomplete", function(obj) {
    process.stderr.write("\n");
    process.stderr.write("Backup complete - written" + JSON.stringify(obj) + "\n");
  });

 
