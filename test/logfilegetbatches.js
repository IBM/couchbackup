var assert = require('assert');
var logfilegetbatches = require('../includes/logfilegetbatches.js');

describe('Fetching batches from a log file', function() {
  
  it('should fetch multiple batches correctly', function(done) {
    logfilegetbatches('./test/test.log', [1,4], function(err, data) {
      assert.equal(typeof data, 'object');
      assert.equal(Object.keys(data).length, 2);
      assert.deepEqual(data['1'].docs, [{"id":"6"},{"id":"7"},{"id":"8"},{"id":"9"},{"id":"10"}] );
      assert.equal(data['1'].batch, 1);
      assert.deepEqual(data['4'].docs, [{"id":"21"},{"id":"22"}])
      assert.equal(data['4'].batch, 4);
      done();
    })
  });

});