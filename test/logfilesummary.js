var assert = require('assert');
var logfilesummary = require('../includes/logfilesummary.js');

describe('fetching summart from thed log file', function() {
  
  it('should fetch a summary correctly', function(done) {
    logfilesummary('./test/test.log', function(err, data) {
      assert.equal(data.changesComplete, true);
      assert.equal(typeof data.batches, 'object');
      assert.equal(Object.keys(data.batches).length, 2);
      assert.deepEqual(data.batches['1'], true);
      assert.deepEqual(data.batches['4'], true)
      done();
    })
  });

});