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
	
	evaluate(input, function (err, result, timing) {
		var prettyprint = require('./lib/bricks-prettyprint');
		
		var options = {
			terminal: !!process.stdout.isTTY,
			useColors: require('chalk').supportsColor
		};
		
		if (err) {
			process.stderr.write(prettyprint(input, err, timing, options));
			process.exit(-1);
			return;
		}
		
		process.stdout.write(prettyprint(input, result, timing, options));
		process.exit(0);
	});
});
