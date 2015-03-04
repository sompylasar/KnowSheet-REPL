'use strict';

if (process.stdin.isTTY) {
	module.exports = require('./lib/repl').start();
	return;
}

var input = '';
process.stdin.resume();
process.stdin.setEncoding('utf-8');
process.stdin.on('data', function (buf) { input += buf; });
process.stdin.on('end', function () {
	var evaluate = require('./lib/bricks-evaluate');
	var timing = require('./lib/bricks-timing')();
	
	evaluate(input, function (err, result) {
		timing.end();
		
		var prettyprint = require('./lib/bricks-prettyprint');
		
		var options = {
			terminal: !!process.stdout.isTTY,
			useColors: require('chalk').supportsColor
		};
		
		// Treat `undefined` result as an error.
		// TODO(sompylasar): Think up something for the APIs that return void.
		if (!err && typeof result === 'undefined') {
			err = new Error('The result is `undefined`.');
		}
		
		if (err) {
			process.stderr.write(prettyprint(input, err, timing, options));
			process.exit(-1);
			return;
		}
		
		process.stdout.write(prettyprint(input, result, timing, options));
		process.exit(0);
	});
});
