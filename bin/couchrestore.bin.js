#!/usr/bin/env node
var opts = require('../includes/config.js');
  couchbackup = require('../app.js'),

couchbackup.restore(opts.COUCH_URL, opts.COUCH_DATABASE, opts.COUCH_BUFFER_SIZE, opts.COUCH_PARALLELISM, process.stdin)
  .on("written", function(obj) {
    process.stderr.write(" written " + obj.total + "\r");
  })
  .on("writecomplete", function(obj) {
    process.stderr.write("\n");
    process.stderr.write("restore complete");
  });