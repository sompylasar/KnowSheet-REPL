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
	
	var api = require('./bricks-net-api');
	
	
	function hideContextProperty(x) {
		Object.defineProperty(context, x, {
			configurable: false,
			enumerable: (x in api ? true : false),
			writable: false,
			value: (x in api ? api[x] : undefined)
		});
	}
	
	
	// Blacklist everything that does not make sense in C++ code.
	// TODO(sompylasar): Add checks for these objects to the source code transform.
	
	// - everything in `global`.
	for (var x in global) {
		hideContextProperty(x);
	}
	
	// - the standard object types that are not in `global`.
	[
		Array, Boolean, Date, Function, Number, Object, RegExp, String,
		ArrayBuffer, DataView, Float32Array, Float64Array, Int16Array, Int32Array,
		Int8Array, Uint16Array, Uint32Array, Uint8Array,
		Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError
	].forEach(function (x) {
		hideContextProperty(x.name);
	});
	
	// - the Node.js-specific items.
	[
		'require',
		'module',
		'global',
		'JSON'
	].forEach(function (x) {
		hideContextProperty(x);
	});
	
	
	// Add Bricks API.
	extend(context, api);
	
	
	/**
	 * A class that mimics the C++ serializable type to demonstrate the JSON-POST.
	 */
	function DemoObject() {
		if (!(this instanceof DemoObject)) {
			return new DemoObject();
		}
		
		this.demo_string = "string";
		this.demo_double = 123.456;
		this.demo_vector = [ 1, 2, 3 ];
		this.demo_map = {
			"key": "value"
		};
	}
	
	/**
	 * Custom inspect function for the `DemoObject`.
	 * Returns an instance of the `Documentation` object 
	 * that will be handled in a special way by the pretty-printer.
	 *
	 * For example, if you evaluate just `DemoObject`:
	 * `KnowSheet> DemoObject`
	 * the interactive shell will print:
	 * `// A cerealizable class for JSON-POST demonstration.`
	 *
	 * @see bricks-prettyprint
	 *
	 * @return {Documentation} The documentation object.
	 */
	DemoObject.inspect = DemoObject.toString = function () {
		return new (require('./bricks-prettyprint').Documentation)(
			'// A cerealizable class for JSON-POST demonstration.'
		);
	};
	
	// Add the `DemoObject` to the context.
	context.DemoObject = DemoObject;
	
	
	// Freeze the context.
	for (var x in context) {
		if (context[x] !== undefined) {
			Object.defineProperty(context, x, {
				configurable: false,
				enumerable: true,
				writable: false
			});
		}
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
	
	var retIdentifierName = '__ret' + Math.floor(1000 + Math.random() * 1000);
	
	var whenIdentifier = b.identifier(options.when);
	var thenIdentifier = b.identifier('then');
	var joinIdentifier = b.identifier('join');
	var retIdentifier = b.identifier(retIdentifierName);
	
	
	/**
	 * Throws a `SyntaxError` for blacklisted expressions.
	 */
	function throwSyntaxError(node) {
		throw new SyntaxError('Invalid expression: ' + recast.print(node).code);
	}
	
	/**
	 * Blacklist several JavaScript expressions that require additional check logic.
	 */
	function checkBlacklist(node) {
		// Blacklist `this` references (e.g. `this.something`).
		if (n.MemberExpression.check(node) && n.ThisExpression.check(node.object)) {
			throwSyntaxError(node);
		}
		
		// Blacklist computed MemberExpression (e.g. `obj["property"]`).
		if (n.MemberExpression.check(node) && node.computed) {
			throwSyntaxError(node);
		}
		
		// Check the expression that is being called as a function.
		if (n.CallExpression.check(node)) {
			checkBlacklist(node.callee);
		}
	}
	
	/**
	 * Performs the following AST transform for a CallExpression:
	 *     aaa(bbb, ccc) -> when.join(bbb, ccc).then(function (ret) { return aaa(ret[0], ret[1]); })
	 */
	function whenThenCallExpression(callExpression) {
		checkBlacklist(callExpression);
		
		// No need to wrap the empty list.
		if (callExpression.arguments.length === 0) {
			return callExpression;
		}
		
		// No need to wrap if all the arguments are literals.
		var allLiterals = true;
		for (var ic = callExpression.arguments.length, i = 0; i < ic; ++i) {
			allLiterals = allLiterals && n.Literal.check(callExpression.arguments[i]);
		}
		if (allLiterals) {
			return callExpression;
		}
		
		var joinMember = b.memberExpression(
			whenIdentifier,
			joinIdentifier,
			false
		);
		
		var callWhen = b.callExpression(joinMember, callExpression.arguments.map(whenThen));
		
		var thenMember = b.memberExpression(
			callWhen,
			thenIdentifier,
			false
		);
		
		var retArguments = callExpression.arguments.map(function (arg, index) {
			return b.memberExpression(
				retIdentifier,
				b.literal(index),
				true
			);
		});
		
		var functionExpression = b.functionExpression(
			null,
			[ retIdentifier ],
			b.blockStatement(
				[
					b.returnStatement(
						b.callExpression(
							callExpression.callee,
							retArguments
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
	
	/**
	 * Performs the following AST transform for a MemberExpression:
	 *     aaa.bbb -> when(aaa).then(function (ret) { return ret.bbb; })
	 */
	function whenThenMemberExpression(memberExpression) {
		checkBlacklist(memberExpression);
		
		var callWhen = b.callExpression(whenIdentifier, [
			whenThen(memberExpression.object)
		]);
		
		var thenMember = b.memberExpression(
			callWhen,
			thenIdentifier,
			false
		);
		
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
	
	/**
	 * Wraps the given AST node in a `when(...).then(...)`.
	 */
	function whenThen(node) {
		checkBlacklist(node);
		
		if (n.MemberExpression.check(node)) {
			return whenThenMemberExpression(node);
		}
		else if (n.CallExpression.check(node)) {
			return whenThenCallExpression(node);
		}
		else {
			return node;
		}
	}
	
	
	// The AST visitors.
	var visitors = {
		visitCallExpression: function (path) {
			path.replace(whenThen(path.value));
			return false;
		},
		visitMemberExpression: function (path) {
			path.replace(whenThen(path.value));
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
	
	
	// Parse and transform the AST, then compile back into the source code.
	var ast = recast.parse(code);
	recast.visit(ast, visitors);
	return recast.print(ast).code;
}

function evaluate(code, context, filename, callback, options) {
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
		
		if (options && options.showContext) {
			console.log(require('util').inspect(context));
		}
		
		if (options && options.showTransformedCode) {
			console.log(code.split('\n').map(function (line, index) {
				return ((index + 1) + ' | ' + line);
			}).join('\n') + '\n');
		}
		
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

function evaluateDefault(code, callback, options) {
	return evaluate(code, createContext(), '', callback, options);
}


function complete(line, callback, options) {
	if (/(([^a-zA-Z_]|^)\s*)(GET|POST)\(["']$/.test(line)) {
		callback(null, [ [ 'http://' ], '' ]);
		return;
	}
	
	if (/["']$/.test(line)) {
		callback(null, [ [], line ]);
		return;
	}
	
	var context = (options && options.context) || createContext();
	
	var RE_TRAILING_IDENTIFIER = /(([^a-zA-Z_]|^)\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
	
	var trailingIdentifierMatch = RE_TRAILING_IDENTIFIER.exec(line);
	var trailingIdentifierName = (trailingIdentifierMatch && trailingIdentifierMatch[2] !== '.'
		? trailingIdentifierMatch[3]
		: undefined
	);
	
	var keys = Object.keys(context);
	
	var completions = (
		trailingIdentifierName
			? keys.filter(function (k) {
				return (context[k] !== undefined && k.indexOf(trailingIdentifierName) === 0);
			})
			: keys
	);
	
	if (trailingIdentifierName && typeof context[trailingIdentifierName] === 'function') {
		completions = [ trailingIdentifierName + '()' ];
	}
	
	callback(null, [ completions, (trailingIdentifierName ? trailingIdentifierName : line) ]);
}


module.exports = evaluateDefault;
module.exports.createContext = createContext;
module.exports.evaluate = evaluate;
module.exports.complete = complete;
