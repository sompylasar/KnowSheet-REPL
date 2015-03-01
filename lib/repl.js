'use strict';

var repl = require('repl');
var REPLServer = repl.REPLServer;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

// Promise library for handling sync and async REPL evaluations the same way.
var when = require('when');

var extend = require('./extend');

/**
 * A Read-Eval-Print-Loop (REPL) to demonstrate the KnowSheet Bricks C++ syntax.
 * 
 * Note: Only the `options` object constructor is supported, in contrast to `REPLServer`.
 * 
 * @param {Object} [options] The REPL options. See `REPLServer` for details.
 *     Some defaults are overridden:
 *       - `prompt` defaults to `"Bricks> "`
 *       - `ignoreUndefined` defaults to `true`
 */
function KnowSheetREPLServer(options) {
	// Credits to the `REPLServer` source code for some of the following snippets.
	
	// Support instantiation without `new`.
	if (!(this instanceof KnowSheetREPLServer)) {
		return new KnowSheetREPLServer(options);
	}
	
	options = options || {};
	
	// Change the default `prompt`.
	if (typeof options.prompt === 'undefined') {
		options.prompt = 'KnowSheet> ';
	}
	
	// Avoid printing `undefined` if nothing gets returned (frequent in Bricks syntax).
	if (typeof options.ignoreUndefined === 'undefined') {
		options.ignoreUndefined = true;
	}
	
	REPLServer.call(this, options);
	
	var defaultEval = this.eval;
	this.eval = function (code, context, file, cb) {
		defaultEval(code, context, file, function (err, evalResult) {
			// Sync error.
			if (err) {
				cb(err);
				return;
			}
			
			// Async evaluation.
			when(evalResult).done(function (actualResult) {
				cb(null, actualResult);
			}, function (err) {
				cb(err);
			});
		});
	};
}

inherits(KnowSheetREPLServer, REPLServer);

KnowSheetREPLServer.prototype.createContext = function () {
	// HACK: Prevent `REPLServer#createContext` from adding `_builtinLibs` to the context.
	var _builtinLibs = repl._builtinLibs;
	if (_builtinLibs) {
		repl._builtinLibs = [];
	}
	
	var context = REPLServer.prototype.createContext.apply(this, arguments);
	
	if (_builtinLibs) {
		repl._builtinLibs = _builtinLibs;
	}
	
	// Delete everything that does not make sense in C++ code.
	for (var x in context) {
		// All upper-case names are native JavaScript classes we don't want in the scope.
		if (x.charAt(0) === x.charAt(0).toUpperCase()) {
			delete context[x];
		}
	}
	
	// Delete Node-specific references.
	delete context.require;
	delete context.module;
	delete context.global;
	
	// Add Bricks API.
	extend(context, require('./bricks-net-api'));
	
	return context;
};


module.exports = {
	start: function (options) {
		return new KnowSheetREPLServer(options);
	}
};
