'use strict';

var util = require('util');
var chalk = require('chalk');

var terminalBoundary = (new Array(81)).join('-');


function prettyprintObject(obj, options) {
	options = options || {};
	
	var output = '';
	
	if (util.isError(obj)) {
		output = chalk.red(obj);
	}
	else {
		if (typeof obj === 'string') {
			output = obj;
		}
		else {
			output = util.inspect(obj, undefined, undefined, !!options.useColors);
		}
	}
	
	if (!options.useColors) {
		output = chalk.stripColor(output);
	}
	
	return output + '\n';
}

function prettyprintTiming(timing, options) {
	options = options || {};
	
	var output = '';
	
	if (!timing) {
		return output;
	}
	
	var endTime = timing.endTime || Date.now();
	
	var duration = (endTime - timing.startTime);
	var unit = 'ms';
	var color = 'green';
	
	if (duration > 150) {
		color = 'yellow';
	}
	if (duration > 500) {
		color = 'red';
	}
	
	if (duration > 1000) {
		unit = 's';
		duration /= 1000;
	}
	
	if (timing.endTime) {
		output = chalk[color]('(' + duration + unit + ')');
	}
	else {
		output = chalk[color]('(' + duration + unit + ' so far)');
	}
	
	if (!options.useColors) {
		output = chalk.stripColor(output);
	}
	
	return output + '\n';
}

module.exports = function (input, result, timing, options) {
	options = options || {};
	
	var output = '';
	
	if (typeof result === 'undefined') {
		return (options.terminal
			? prettyprintObject(result, options) + prettyprintTiming(timing, options)
			: ''
		);
	}
	
	output = (
		(options.terminal
			? chalk.gray(terminalBoundary) + '\n'
			: ''
		) +
		prettyprintObject(result, options) +
		(options.terminal
			?
				chalk.gray(terminalBoundary) + '\n' +
				prettyprintTiming(timing, options)
			: ''
		)
	);
	
	if (!options.useColors) {
		output = chalk.stripColor(output);
	}
	
	return output;
};
module.exports.prettyprintObject = prettyprintObject;
module.exports.prettyprintTiming = prettyprintTiming;
