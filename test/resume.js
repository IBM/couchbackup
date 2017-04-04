var assert = require('assert');
var resume = require('../includes/resume.js');

describe('Resuming and log file parsing', function() {
  
  it('should parse a log file correctly', function(done) {
    resume('./test/test.log', true, function(err, data) {
      assert.equal(data.changesComplete, true);
      assert.equal(typeof data.unfinished, 'object');
      assert.equal(data.unfinished.length, 2);
      assert.deepEqual(data.unfinished[0], { batch: 1, docs: [{"id":"6"},{"id":"7"},{"id":"8"},{"id":"9"},{"id":"10"}] });
      assert.deepEqual(data.unfinished[1], { batch: 4, docs: [  {"id":"21"},{"id":"22"}] })
      done();
    })
  });

  it('should return sensible defaults when not resuming', function(done) {
    resume('./test/test.log', false, function(err, data) {
      assert.equal(data.changesComplete, false);
      assert.equal(typeof data.unfinished, 'object');
      assert.equal(data.unfinished.length, 0);
      done();
    })
  });
});