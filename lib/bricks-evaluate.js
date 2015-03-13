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
	 * Blacklist JavaScript-specific expressions.
	 *
	 * @see https://github.com/benjamn/ast-types/blob/master/def/core.js
	 * @see Mozilla Parser API https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
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
			
			for (var ic = node.arguments.length, i = 0; i < ic; ++i) {
				checkBlacklist(node.arguments[i]);
			}
		}
		
		// Blacklist function expressions that are not the lambdas converted to functions.
		if (n.FunctionExpression.check(node) || n.FunctionDeclaration.check(node)) {
			if (!(node.id && (
				options
				&& options.lambdas
				&& options.lambdas.indexOf(node.id.name) >= 0
			))) {
				throwSyntaxError(node);
			}
		}
		
		if (
			n.ArrayExpression.check(node)
			|| n.ObjectExpression.check(node)
			|| n.ThisExpression.check(node)
			|| n.NewExpression.check(node)
			|| n.VariableDeclaration.check(node)
			|| n.VariableDeclarator.check(node)
			|| n.ForInStatement.check(node)
			|| n.DebuggerStatement.check(node)
		) {
			throwSyntaxError(node);
		}
		
		if (n.UnaryExpression.check(node)) {
			if ([ 'typeof', 'void', 'delete' ].indexOf(node.operator) >= 0) {
				throwSyntaxError(node);
			}
		}
		
		if (n.BinaryExpression.check(node)) {
			if ([ 'instanceof' ].indexOf(node.operator) >= 0) {
				throwSyntaxError(node);
			}
		}
	}
	
	/**
	 * Performs the following AST transform for a CallExpression:
	 *     aaa(bbb, ccc) -> when.join(bbb, ccc).then(function (ret) { return aaa(ret[0], ret[1]); })
	 */
	function whenThenCallExpression(callExpression) {
		checkBlacklist(callExpression);
		checkBlacklist(callExpression.callee);
		
		// No need to wrap the empty list.
		if (callExpression.arguments.length === 0) {
			return callExpression;
		}
		
		var allLiterals = true;
		for (var ic = callExpression.arguments.length, i = 0; i < ic; ++i) {
			checkBlacklist(callExpression.arguments[i]);
			
			allLiterals = allLiterals && n.Literal.check(callExpression.arguments[i]);
		}
		
		// No need to wrap if all the arguments are literals.
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
		visitNode: function (path) {
			checkBlacklist(path.value);
			this.traverse(path);
		},
		visitCallExpression: function (path) {
			path.replace(whenThen(path.value));
			return false;
		},
		visitMemberExpression: function (path) {
			path.replace(whenThen(path.value));
			return false;
		}
	};
	
	
	// Parse and transform the AST, then compile back into the source code.
	var ast = recast.parse(code);
	recast.visit(ast, visitors);
	return recast.print(ast).code;
}

function evaluate(code, context, filename, callback, options) {
	var timing;
	try {
		var SPACE_RE = /\s+/g;
		var TRIM_SPACE_RE = /(^\s+)|(\s+$)/g;
	
		// Matches "[ &anything ] ( Type123 name_123 ) {"
		var CPP_LAMBDA_RE = /(\[([^\]]*?)\]\s*\(([^)]*?)\))\s*\{/g;
	
		// Matches "name_123"
		var CPP_IDENTIFIER_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
	
		// Matches "const Type123 & name_123"
		var CPP_ARG_RE = /^\s*(.*?)([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
	
		// Matches "function () {"
		var JS_ANONYMOUS_FUNCTION_RE = /\bfunction\b\s*\(([^)]*?)\)\s*\{/g;
	
	
		// Blacklist anonymous top-level functions (the parser throws 'Unexpected (' on them).
		var anonymousFunctionMatch = JS_ANONYMOUS_FUNCTION_RE.exec(code);
		if (anonymousFunctionMatch) {
			throw new SyntaxError('Invalid expression: ' + anonymousFunctionMatch[0]);
		}
	
		var syntaxErrorIdentifierName = '__syntaxError' + Math.floor(1000 + Math.random() * 1000);
		context[syntaxErrorIdentifierName] = SyntaxError;
	
		// The array of converted lambda names that will be whitelisted in the parser.
		var lambdas = [];
	
		// Convert C++ lambda syntax to JS.
		code = code.replace(CPP_LAMBDA_RE, function (m, header, captures, args) {
			// Generate a unique name for this lambda.
			var lambdaIdentifierName = '__lambda' + Math.floor(1000 + Math.random() * 1000);
		
			// Remember the lambda name for whitelisting.
			lambdas.push(lambdaIdentifierName);
		
			// Collect the captured names to reference them later.
			var captureNames = captures.split(/,\s*/).map(function (capture) {
				var captureName = capture.replace(SPACE_RE).replace(/[^a-zA-Z0-9_]+/g, '');
				return captureName;
			}).filter(function (captureName) {
				return !!captureName;
			});
		
			// Collect expressions that check the arguments inside the function.
			var checkArgs = [];
		
			// Filter out argument types and modifiers, keep only names.
			var argNames = args.split(/,\s*/).map(function (arg) {
				var argParts = CPP_ARG_RE.exec(arg);
				var argType = (argParts[1] || '').replace(TRIM_SPACE_RE, '');
				var argName = (argParts[2] || '').replace(TRIM_SPACE_RE, '');
			
				// Whitelist only arguments without modifiers.
				if (!CPP_IDENTIFIER_RE.test(argType) || !CPP_IDENTIFIER_RE.test(argName)) {
					throw new SyntaxError('Invalid expression: ' + m);
				}
			
				if (context[argType] === undefined) {
					throw new SyntaxError('Unknown type: ' + argType);
				}
			
				checkArgs.push(
					'\tif (' + argName + ' === undefined) {\n' +
						'\t\tthrow ' + syntaxErrorIdentifierName + '(\'Argument "' + argName + '" missing from the call to ' + header.replace('\'', '\\\'') + '.\');\n' +
					'\t}\n'
				);
			
				return argName;
			});
		
			return (
				// Reference the captured names to test if they are defined.
				(captureNames.length ? ';(' + captureNames.join(');(') + ');\n' : '') +
			
				// Transform the lambda into a JS function.
				// Assignment is used to convert to the FunctionExpression.
				// We cannot use `(` because the position of the closing `}` is not known.
				lambdaIdentifierName + ' = function ' + lambdaIdentifierName + '(' + argNames + ') {\n' +
			
				// Add arguments check.
				checkArgs.join('')
			);
		});
		
		// Put a reference to `when` into the context.
		// We generate random identifier to prevent exploiting it from the provided code.
		var whenIdentifierName = '__when' + Math.floor(1000 + Math.random() * 1000);
		context[whenIdentifierName] = when;
		
		// Convert the code to promise-based.
		// `when` is referenced via the passed identifier.
		code = transformCode(code, {
			when: whenIdentifierName,
			lambdas: lambdas
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
