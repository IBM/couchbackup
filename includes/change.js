// stolen from http://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
var stream = require('stream');

 
module.exports = function(onChange) {
  
  var change = new stream.Transform( { objectMode: true } );
 
  change._transform = function (line, encoding, done) {
    var obj = null;
    line = line.trim().replace(/,$/,'');
    try {
      obj = JSON.parse(line);
    } catch(e) {
    }
    onChange(obj);
    done();
  }
  
  return change;
}