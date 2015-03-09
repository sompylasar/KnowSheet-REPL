'use strict';

var REPLServer = require('repl').REPLServer;
var inherits = require('util').inherits;


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
	
	var _this = this;
	
	options = options || {};
	
	// Always use our own context.
	options.useGlobal = false;
	
	// Change the default `prompt`.
	if (typeof options.prompt === 'undefined') {
		options.prompt = 'KnowSheet> ';
	}
	
	// Avoid printing `undefined`.
	// We always return `undefined` and provide our own `writer`,
	// but `REPLServer` has several parts of code out of our control,
	// so this is a precaution.
	options.ignoreUndefined = true;
	
	var prettyprint = require('./bricks-prettyprint');
	var prettyprintObject = prettyprint.prettyprintObject;
	
	options.writer = function (obj, showHidden, depth) {
		return prettyprintObject(obj, {
			terminal: !!_this.outputStream.isTTY,
			useColors: _this.useColors
		});
	};
	
	options.eval = function (code, context, file, cb) {
		var evaluate = require('./bricks-evaluate');
		var timing = require('./bricks-timing')();
		
		if (/^\s*$/.test(code)) {
			cb(null, undefined);
			return;
		}
		
		evaluate.evaluate(code, context, file, function (err, result) {
			timing.end();
			
			_this.outputStream.write(prettyprint(code, err || result, timing, {
				terminal: !!_this.outputStream.isTTY,
				useColors: _this.useColors,
				showErrorStack: (process.env.NODE_ENV === 'development')
			}));
			
			cb(null, undefined);
		}, {
			showContext: (process.env.NODE_ENV === 'development'),
			showTransformedCode: (process.env.NODE_ENV === 'development')
		});
	};
	
	REPLServer.call(this, options);
	
	this.on('exit', function () {
		// Force terminate to destroy the listening sockets.
		process.exit();
	});
}

inherits(KnowSheetREPLServer, REPLServer);

KnowSheetREPLServer.prototype.createContext = function () {
	var context = require('./bricks-evaluate').createContext();
	
	this.lines = [];
	this.lines.level = [];
	
	return context;
};

KnowSheetREPLServer.prototype.complete = function (line, callback) {
	require('./bricks-evaluate').complete(line, callback, {
		context: this.context
	});
};


module.exports = {
	start: function (options) {
		return new KnowSheetREPLServer(options);
	}
};
