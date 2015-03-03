'use strict';

var vm = require('vm');

// Promise library for handling sync and async REPL evaluations the same way.
var when = require('when');


function createContext() {
	var context = vm.createContext();
	
	// Delete everything that does not make sense in C++ code.
	for (var x in context) {
		// Everything in `global` is native to JavaScript.
		if (x in global) {
			delete context[x];
		}
	}
	
	// Delete Node-specific references.
	delete context.require;
	delete context.module;
	delete context.global;
	
	// Add Bricks API.
	require('./extend')(context, require('./bricks-net-api'));
	
	// Freeze the context.
	for (var x in context) {
		Object.defineProperty(context, x, {
			configurable: false,
			enumerable: true,
			writable: false
		});
	}
	
	return context;
}

function evaluate(code, context, filename, callback) {
	try {
		var script = vm.createScript(code, {
			filename: filename,
			displayErrors: false
		});
		
		var result = script.runInContext(context, {
			displayErrors: false
		});
		
		// Async evaluation.
		when(result).done(function (actualResult) {
			callback(null, actualResult);
		}, function (err) {
			callback(err);
		});
	}
	catch (ex) {
		callback(ex);
	}
}

function evaluateDefault(code, callback) {
	return evaluate(code, createContext(), '', callback);
}


module.exports = evaluateDefault;
module.exports.createContext = createContext;
module.exports.evaluate = evaluate;
