'use strict';

var inspect = require('util').inspect;

// @see https://github.com/brianmcd/contextify#requirevm-vs-contextify
var USE_CONTEXTIFY = true;
var vm = require('vm');
var Contextify = require('contextify');

// Promise library for handling sync and async REPL evaluations the same way.
var when = require('when');

var extend = require('./extend');

var transforms = require('./promise-transforms');

var api = require('./bricks-net-api');


function _hideContextProperty(context, name, value) {
	Object.defineProperty(context, name, {
		configurable: true,
		enumerable: (name in api ? true : false),
		writable: ((name in global) && !(name in api)),
		value: (name in api ? api[name] : value)
	});
}


/**
 * Creates the context that contains the KnowSheet Bricks API.
 *
 * @return {vm.Context} The contextified object ready to use in the `vm` code runner.
 */
function createContext() {
	var context;
	
	if (USE_CONTEXTIFY) {
		context = Contextify({});
		
		_hideContextProperty(context, 'run', context.run);
		_hideContextProperty(context, 'getGlobal', context.getGlobal);
		_hideContextProperty(context, 'dispose', context.dispose);
	}
	else {
		context = vm.createContext();
	}
	
	function hideContextProperty(context, name) {
		_hideContextProperty(context, name);
	}
	
	// Blacklist everything that does not make sense in C++ code.
	// TODO(sompylasar): Add checks for these objects to the source code transform.
	
	// - everything in `global`.
	for (var x in global) {
		hideContextProperty(context, x);
	}
	
	// - the standard object types that are not in `global`.
	[
		Array, Boolean, Date, Function, Number, Object, RegExp, String,
		ArrayBuffer, DataView, Float32Array, Float64Array, Int16Array, Int32Array,
		Int8Array, Uint16Array, Uint32Array, Uint8Array,
		Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError
	].forEach(function (x) {
		hideContextProperty(context, x.name);
	});
	
	// - the Node.js-specific items.
	[
		'require',
		'module',
		'global',
		'JSON'
	].forEach(function (x) {
		hideContextProperty(context, x);
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
		
		require('./bricks-json').Serializable.call(this);
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
function transformCode(code, transformOptions, showTransformedCode) {
	var recast = require('recast');
	var n = recast.types.namedTypes;
	var b = recast.types.builders;
	
	/**
	 * Throws a `SyntaxError` for blacklisted expressions.
	 */
	function throwSyntaxError(node) {
		throw new SyntaxError('Invalid expression: ' + recast.print(node).code);
	}
	
	/**
	 * Checks if the node is a function transformed from a C++ lambda.
	 */
	function isLambda(node) {
		return (
			(n.FunctionExpression.check(node) || n.FunctionDeclaration.check(node))
			&& node.id && (
				transformOptions.lambdas[node.id.name]
			)
		);
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
		
		// Whitelist function expressions that are the lambdas converted to functions.
		if (isLambda(node)) {
			return;
		}
		
		if (
			n.VariableDeclaration.check(node)
			&& node.declarations.length === 1
			&& n.VariableDeclarator.check(node.declarations[0])
			&& node.declarations[0].id && node.declarations[0].id.name === transformOptions.when
		) {
			return;
		}
		
		// Blacklist other JavaScript-specific expressions.
		if (
			n.ArrayExpression.check(node)
			|| n.ObjectExpression.check(node)
			|| n.ThisExpression.check(node)
			|| n.NewExpression.check(node)
			|| n.VariableDeclaration.check(node)
			|| n.VariableDeclarator.check(node)
			|| n.ForInStatement.check(node)
			|| n.DebuggerStatement.check(node)
			|| n.FunctionExpression.check(node)
			|| n.FunctionDeclaration.check(node)
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
	
	// Parse the source code into the AST.
	var ast = recast.parse(code);
	
	// Blacklist check.
	recast.visit(ast, {
		visitNode: function (path) {
			checkBlacklist(path.value);
			this.traverse(path);
		}
	});
	
	// Transform to promise-aware code.
	ast = require('./promise-transforms').transformAST(ast, transformOptions);
	
	// Compile back into the source code.
	var code = recast.prettyPrint(ast).code;
	
	if (showTransformedCode) {
		console.log(code.split('\n').map(function (line, index) {
			return (('000' + (index + 1)).slice(-4) + ' | ' + line);
		}).join('\n') + '\n');
	}
	
	// Safety syntax check.
	recast.parse(code);
	
	return code;
}

function evaluate(code, context, filename, callback, options) {
	var contextifiedContext;
	var result;
	var timing;
	
	function dispose() {
		try {
			if (transformOptions) {
				// Remove the references that were previously added to the context.
				delete context[transformOptions.require];
				delete context[transformOptions.console];
				delete context[transformOptions.globals.SyntaxError];
			}
			if (contextifiedContext) {
				contextifiedContext.dispose();
				contextifiedContext = null;
			}
		}
		catch (ex) {
			console.error(ex);
		}
	}
	
	function finish(err, result, timing) {
		if (timing && !timing.endTime) {
			timing.end();
		}
		
		dispose();
		callback(err, result, timing);
	}
	
	try {
		var SPACE_RE = /\s+/g;
		var TRIM_SPACE_RE = /(^\s+)|(\s+$)/g;
		
		// Matches "[ any, captured, vars ] ( Any typed_args ) {"
		var CPP_LAMBDA_RE = /(\[([^\]]*?)\]\s*\(([^)]*?)\))\s*\{/g;
		
		// Matches "name_123"
		var CPP_IDENTIFIER_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
		
		// Matches "const Type123 & name_123"
		var CPP_ARG_RE = /^\s*(.*?)([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
		
		// Matches "function (any, args) {"
		var JS_ANONYMOUS_FUNCTION_RE = /\bfunction\b\s*\(([^)]*?)\)\s*\{/g;
		
		
		// Blacklist anonymous top-level functions (the parser throws 'Unexpected (' on them).
		var anonymousFunctionMatch = JS_ANONYMOUS_FUNCTION_RE.exec(code);
		if (anonymousFunctionMatch) {
			throw new SyntaxError('Invalid expression: ' + anonymousFunctionMatch[0]);
		}
		
		
		var transformOptions = transforms.createOptions();
		
		var globals = transformOptions.globals = transformOptions.globals || {};
		
		globals["SyntaxError"] = transforms.makeRandomIdentifierName('__SyntaxError');
		
		
		// The set of converted lambda names that will be whitelisted in the parser.
		var lambdas = transformOptions.lambdas = transformOptions.lambdas || {};
		
		// Convert C++ lambda syntax to JS.
		code = code.replace(CPP_LAMBDA_RE, function (m, header, captures, args) {
			// Generate a unique name for this lambda.
			var lambdaIdentifierName = transforms.makeRandomIdentifierName('__lambda');
			
			// Remember the lambda name for whitelisting.
			lambdas[lambdaIdentifierName] = lambdaIdentifierName;
			
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
						'\t\tthrow ' + transformOptions.globals.SyntaxError +
							'(\'Argument "' + argName + '" missing from the call to ' + header.replace('\'', '\\\'') + '.\');\n' +
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
		
		_hideContextProperty(context, transformOptions.require, require);
		_hideContextProperty(context, transformOptions.console, console);
		_hideContextProperty(context, transformOptions.globals.SyntaxError, SyntaxError);
		
		Object.keys(context).forEach(function (x) {
			if (context[x] !== undefined) {
				globals[x] = x;
			}
		});
		
		// Convert the code to promise-based.
		// `when` is referenced via the passed identifier.
		code = transformCode(code, transformOptions,
			options && options.showTransformedCode
		);
		
		if (options && options.showContext) {
			console.log(require('util').inspect(context));
		}
		
		if (USE_CONTEXTIFY) {
			// Start the timing measurement.
			timing = require('./bricks-timing')();
			
			// Execute the script.
			result = context.run(code);
		}
		else {
			// Compile the script from the code.
			var script = vm.createScript(code, {
				filename: filename,
				displayErrors: false
			});
			
			// Start the timing measurement.
			timing = require('./bricks-timing')();
			
			// Execute the script.
			result = script.runInContext(context, {
				displayErrors: false,
				timeout: 10000
			});
		}
		
		// Wait for the result to resolve.
		when(result).done(function (actualResult) {
			timing.end();
			
			// Treat `undefined` result as an error.
			// TODO(sompylasar): Think up something for the APIs that return void.
			if (typeof actualResult === 'undefined') {
				var err = new Error('The result is `undefined`.');
				finish(err, undefined, timing);
				return;
			}
			
			finish(null, actualResult, timing);
		}, function (err) {
			finish(err, undefined, timing);
		});
	}
	catch (ex) {
		finish(ex, undefined, timing);
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
