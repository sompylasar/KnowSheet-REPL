'use strict';

var vm = require('vm');

// Promise library for handling sync and async REPL evaluations the same way.
var when = require('when');

var extend = require('./extend');

/**
 * Creates the context that contains the KnowSheet Bricks API.
 *
 * @return {vm.Context} The contextified object ready to use in the `vm` code runner.
 */
function createContext() {
	var context = vm.createContext();
	
	
	// Blacklist everything that does not make sense in C++ code.
	// TODO(sompylasar): Add checks for these objects to the source code transform.
	
	// - everything in `global`.
	for (var x in global) {
		context[x] = undefined;
	}
	
	// - the standard object types that are not in `global`.
	[
		Array, Boolean, Date, Function, Number, Object, RegExp, String,
		ArrayBuffer, DataView, Float32Array, Float64Array, Int16Array, Int32Array,
		Int8Array, Uint16Array, Uint32Array, Uint8Array,
		Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError
	].forEach(function (x) {
		context[x.name] = undefined;
	});
	
	// - the Node.js-specific items.
	[
		'require',
		'module',
		'global',
		'JSON'
	].forEach(function (x) {
		context[x] = undefined;
	});
	
	
	// Add Bricks API.
	extend(context, require('./bricks-net-api'));
	
	
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

/**
 * Transforms the provided source code to handle blocking execution 
 * and avoid JavaScript-specific constructs.
 *
 * Handles property access on objects that could resolve later
 * by wrapping them in `when(...).then(...)` expressions.
 *
 * @param {string} code The source code to transform.
 * @param {string} options.when The generated name of the reference to `when`.
 * @return {string} The transformed source code.
 */
function transformCode(code, options) {
	var recast = require('recast');
	var n = recast.types.namedTypes;
	var b = recast.types.builders;
	
	/**
	 * Performs the following AST transform for a MemberExpression:
	 *     aaa.bbb -> when(aaa).then(function (ret) { return ret.bbb; })
	 */
	function wrapWithWhenThen(memberExpression) {
		if (!n.MemberExpression.check(memberExpression)) {
			return memberExpression;
		}
		
		// Blacklist `this` references.
		if (n.ThisExpression.check(memberExpression.object)) {
			throwSyntaxError(memberExpression);
		}
		
		var whenIdentifier = b.identifier(options.when);
		var thenIdentifier = b.identifier('then');
		
		var callWhen = b.callExpression(whenIdentifier, [
			wrapWithWhenThen(memberExpression.object)
		]);
		
		var thenMember = b.memberExpression(
			callWhen,
			thenIdentifier,
			false
		);
		
		var retIdentifier = b.identifier("ret");
		var functionExpression = b.functionExpression(
			null,
			[ retIdentifier ],
			b.blockStatement(
				[
					b.returnStatement(
						b.memberExpression(
							retIdentifier,
							memberExpression.property,
							memberExpression.computed
						)
					)
				]
			)
		);
		
		var callThen = b.callExpression(thenMember, [
			functionExpression
		]);
		
		return callThen;
	}
	
	function throwSyntaxError(node) {
		throw new SyntaxError('Invalid expression: ' + recast.print(node).code);
	}
	
	var visitors = {
		visitMemberExpression: function (node) {
			// Blacklist computed MemberExpression (e.g. obj["property"]).
			if (node.value.computed) {
				throwSyntaxError(node.value);
			}
			
			node.replace(wrapWithWhenThen(node.value));
			return false;
		},
		
		// Blacklist JavaScript-specific expressions.
		// @see https://github.com/benjamn/ast-types/blob/master/def/core.js
		// @see Mozilla Parser API https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
		visitArrayExpression: throwSyntaxError,
		visitObjectExpression: throwSyntaxError,
		visitThisExpression: throwSyntaxError,
		visitNewExpression: throwSyntaxError,
		visitFunctionExpression: throwSyntaxError,
		visitFunctionDeclaration: throwSyntaxError,
		visitVariableDeclaration: throwSyntaxError,
		visitVariableDeclarator: throwSyntaxError,
		visitForInStatement: throwSyntaxError,
		visitDebuggerStatement: throwSyntaxError
	};
	
	var ast = recast.parse(code);
	recast.visit(ast, visitors);
	return recast.print(ast).code;
}

function evaluate(code, context, filename, callback) {
	// Put a reference to `when` into the context.
	// We generate random identifier to prevent exploiting it from the provided code.
	var whenIdentifierName = '__when' + Math.floor(1000 + Math.random() * 1000);
	context[whenIdentifierName] = when;
	
	var timing;
	try {
		// Convert the code to promise-based.
		// `when` is referenced via the passed identifier.
		code = transformCode(code, {
			when: whenIdentifierName
		});
		
		// Compile the script from the code.
		var script = vm.createScript(code, {
			filename: filename,
			displayErrors: false
		});
		
		// Start the timing measurement.
		timing = require('./bricks-timing')();
		
		// Execute the script.
		var result = script.runInContext(context, {
			displayErrors: false,
			timeout: 10000
		});
		
		// Wait for the result to resolve.
		when(result).done(function (actualResult) {
			timing.end();
			
			// Treat `undefined` result as an error.
			// TODO(sompylasar): Think up something for the APIs that return void.
			if (typeof actualResult === 'undefined') {
				var err = new Error('The result is `undefined`.');
				callback(err, undefined, timing);
				return;
			}
			
			callback(null, actualResult, timing);
		}, function (err) {
			timing.end();
			
			callback(err, undefined, timing);
		});
	}
	catch (ex) {
		if (timing) {
			timing.end();
		}
		
		callback(ex, undefined, timing);
	}
	finally {
		// Remove the reference to `when` that was previously added to the context.
		delete context[whenIdentifierName];
	}
}

function evaluateDefault(code, callback) {
	return evaluate(code, createContext(), '', callback);
}


module.exports = evaluateDefault;
module.exports.createContext = createContext;
module.exports.evaluate = evaluate;
