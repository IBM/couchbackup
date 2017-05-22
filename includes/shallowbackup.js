'use strict';

const async = require('async');
const request = require('./request.js');

module.exports = function(dbUrl, blocksize, parallelism, log, resume) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  const events = require('events');
  const ee = new events.EventEmitter();

  var startdocid = null;
  const start = new Date().getTime();
  var batch = 1;
  var total = 0;

  async.doUntil(function(callback) {
    var opts = {limit: blocksize + 1, include_docs: true};
    if (startdocid) {
      opts.startkey_docid = startdocid;
    }
    var r = {
      url: dbUrl + '/_all_docs',
      method: 'get',
      qs: opts,
      json: true,
      gzip: true
    };
    request(r, function(err, res, data) {
      if (err) {
        ee.emit('error', err);
        return callback(null, null);
      }

      if (data.rows.length === blocksize + 1) {
        startdocid = data.rows[blocksize].id;
      } else {
        startdocid = null;
      }

      var docs = [];
      for (var i = 0; i < Math.min(data.rows.length, blocksize); i++) {
        delete data.rows[i].doc._rev;
        docs.push(data.rows[i].doc);
      }

      total += docs.length;
      var t = (new Date().getTime() - start) / 1000;
      ee.emit('received', {length: docs.length, batch: batch++, time: t, total: total, data: docs});
      callback(null);
    });
  },
  function() {
    return (startdocid == null);
  },
  function(err) {
    ee.emit('finished', {total: total, err: err});
  });

  return ee;
};
