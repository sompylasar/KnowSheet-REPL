'use strict';

var inherits = require('util').inherits;
var inspect = require('util').inspect;
var assert = require('assert');

var recast = require('recast');
var types = recast.types;
var n = types.namedTypes;
var b = types.builders;

var extend = require('./extend');


function makeRandomIdentifierName(prefix) {
	var identifierName = (prefix + Math.floor(1000 + Math.random() * 1000));
	
	return identifierName;
}

var _DEBUG_LOG_TRANSFORM;
/* istanbul ignore next: debug method */
_DEBUG_LOG_TRANSFORM = function (where, sourceNode, resultNode) {
	if (resultNode === sourceNode) {
		console.log('\n\n' +
			'## ' + where + '\n' +
			'## Source:\n' + recast.prettyPrint(sourceNode).code + '\n' + inspect(sourceNode) + '\n\n' +
			'## Result: (unchanged)' + '\n\n'
		);
		return;
	}
	
	console.log('\n\n' +
		'## ' + where + '\n' +
		'## Source:\n' + recast.prettyPrint(sourceNode).code + '\n' + inspect(sourceNode) + '\n\n' +
		'## Result:\n' + recast.prettyPrint(resultNode).code + '\n' + inspect(resultNode) + '\n\n'
	);
};
/* istanbul ignore next: debug method */
_DEBUG_LOG_TRANSFORM = function () {};


function Transformer(options) {
	types.PathVisitor.call(this);
	
	var _this = this;
	
	_this.options = options;
	
	// Keep track of all the generated nodes.
	_this._generated = [];
	
	_this.requireIdentifier = _this.makeNode('identifier', _this.options.require);
	_this.consoleIdentifier = _this.makeNode('identifier', _this.options.console);
	_this.syntaxErrorIdentifier = _this.makeNode('identifier', _this.options.globals.SyntaxError);
	_this.logIdentifier = _this.makeNode('identifier', 'log');
	_this.thenIdentifier = _this.makeNode('identifier', 'then');
	_this.joinIdentifier = _this.makeNode('identifier', 'join');
	_this.retIdentifier = _this.makeNode('identifier', _this.options.ret);
	_this.argsIdentifier = _this.makeNode('identifier', 'args');
	_this.bindIdenifier = _this.makeNode('identifier', 'bind');
	
	_this.whenReference = _this.makeRequire('when');
	_this.whenSequenceReference = _this.makeRequire('when/sequence');
	
	_this.consoleLogMember = _this.makeNode('memberExpression',
		_this.consoleIdentifier,
		_this.logIdentifier,
		false
	);
	
	_this.whenJoinMember = _this.makeNode('memberExpression',
		_this.whenReference,
		_this.joinIdentifier,
		false
	);
}
inherits(Transformer, types.PathVisitor);
extend(Transformer.prototype, {
	isGlobalIdentifier: function (node) {
		var _this = this;
		return (
			n.Identifier.check(node)
			&& Object.keys(_this.options.globals).some(function (x) {
				return (node.name === _this.options.globals[x]);
			})
		);
	},
	
	isLambdaIdentifier: function (node) {
		var _this = this;
		return (
			n.Identifier.check(node)
			&& Object.keys(_this.options.lambdas).some(function (x) {
				return (node.name === _this.options.lambdas[x]);
			})
		);
	},
	
	isLambdaArgumentCheck: function (path) {
		var _this = this;
		var node = path.value;
		
		var ifStatement = node;
		var ifStatementBlock = (
			n.IfStatement.check(ifStatement) && ifStatement.consequent
		);
		var ifStatementBlockBody = (
			ifStatementBlock && ifStatementBlock.body
		);
		var throwStatement = (
			ifStatementBlockBody && ifStatementBlockBody[0]
		);
		var syntaxErrorCall = (
			n.ThrowStatement.check(throwStatement) && throwStatement.argument
		);
		var syntaxErrorIdentifier = (
			n.CallExpression.check(syntaxErrorCall) && syntaxErrorCall.callee
		);
		
		var ret = (
			syntaxErrorIdentifier
			&& n.Identifier.check(syntaxErrorIdentifier)
			&& syntaxErrorIdentifier.name === _this.options.globals.SyntaxError
		);
		
		return ret;
	},
	
	isRootExpression: function (path) {
		return (
			path.parentPath
			&& n.ExpressionStatement.check(path.parentPath.value)
			&& path.parentPath.parentPath
			&& ({}.toString.call(path.parentPath.parentPath.value) === '[object Array]')
			&& path.parentPath.parentPath.parentPath
			&& n.Program.check(path.parentPath.parentPath.parentPath.value)
		);
	},
	
	isGeneratedNode: function (node) {
		var _this = this;
		
		return (_this._generated.indexOf(node) >= 0);
	},
	
	makeNode: function () {
		var _this = this;
		
		var args = [].slice.call(arguments);
		var type = args.shift();
		
		var node = b[type].apply(b, args);
		
		_this._generated.push(node);
		
		return node;
	},
	
	makeRequire: function (moduleName) {
		var _this = this;
		
		return _this.makeNode('callExpression',
			_this.requireIdentifier,
			[ _this.makeNode('literal', moduleName) ]
		);
	},
	
	makeLogCall: function (node) {
		var _this = this;
		
		return _this.makeNode('emptyStatement');
		/*
		return _this.makeNode('expressionStatement', _this.makeNode('callExpression', 
			_this.consoleLogMember,
			[ node ]
		) );
		*/
	},
	
	getReplacementForIdentifier: function (path) {
		var _this = this;
		var node = path.value;
		
		if (_this.isGeneratedNode(node)) {
			_DEBUG_LOG_TRANSFORM('Identifier isGeneratedNode', node, node);
			return node;
		}
		
		if (
			_this.isGlobalIdentifier(node)
			|| _this.isLambdaIdentifier(node)
		) {
			_DEBUG_LOG_TRANSFORM('Identifier', node, node);
			return node;
		}
		
		// Get the name of the function that contains the node as an argument.
		// If it's a lambda, do not wrap the identifier with `when(...)`.
		if (
			path.parentPath
			&& ({}.toString.call(path.parentPath.value) === '[object Array]')
			&& path.parentPath.parentPath
			&& n.FunctionExpression.check(path.parentPath.parentPath.value)
			&& _this.isLambdaIdentifier(path.parentPath.parentPath.value.id)
		) {
			_DEBUG_LOG_TRANSFORM('Identifier', node, node);
			return node;
		}
		
		// when(<identifier>)
		var whenCall = _this.makeNode('callExpression',
			_this.whenReference,
			[ node ]
		);
		
		_DEBUG_LOG_TRANSFORM('Identifier', node, whenCall);
		return whenCall;
	},
	
	getReplacementForMemberExpression: function (path) {
		var _this = this;
		var node = path.value;
		
		if (_this.isGeneratedNode(node)) {
			_DEBUG_LOG_TRANSFORM('MemberExpression isGeneratedNode', node, node);
			return node;
		}
		
		if (_this.isGlobalIdentifier(node.object)) {
			_DEBUG_LOG_TRANSFORM('MemberExpression isGlobalIdentifier', node, node);
			return node;
		}
		
		if (_this.isLambdaIdentifier(node.object)) {
			_DEBUG_LOG_TRANSFORM('MemberExpression isLambdaIdentifier', node, node);
			return node;
		}
		
		// <object>.then
		var thenMember = _this.makeNode('memberExpression',
			_this.getReplacementFor(path.get('object')),
			_this.thenIdentifier,
			false
		);
		
		// ret.<property> or ret[<property>]
		var retMember = _this.makeNode('memberExpression',
			_this.retIdentifier,
			node.property,
			node.computed
		);
		
		var retReturn;
		
		// If this MemberExpression is a callee inside a CallExpression,
		// bind the original context.
		if (
			path.parentPath
			&& n.CallExpression.check(path.parentPath.value)
			&& path.parentPath.value.callee === node
		) {
			var bindMember = _this.makeNode('memberExpression',
				retMember,
				_this.bindIdenifier,
				false
			);
			
			// <retMember>.bind(ret)
			var bindCall = _this.makeNode('callExpression',
				bindMember,
				[ _this.retIdentifier ]
			);
			
			// return <isFunctionConditional>;
			retReturn = _this.makeNode('returnStatement',
				bindCall
			);
		}
		else {
			// return <isFunctionConditional>;
			retReturn = _this.makeNode('returnStatement',
				retMember
			);
		}
		
		// function (ret) { <retReturn> }
		var thenFunction = _this.makeNode('functionExpression',
			null,
			[ _this.retIdentifier ],
			_this.makeNode('blockStatement', [
				_this.makeLogCall(_this.whenReference),
				retReturn
			])
		);
		
		// <object>.then(<thenFunction>)
		var thenCall = _this.makeNode('callExpression',
			thenMember,
			[ thenFunction ]
		);
		
		_DEBUG_LOG_TRANSFORM('MemberExpression', node, thenCall);
		return thenCall;
	},
	
	getReplacementForCallExpression: function (path) {
		var _this = this;
		var node = path.value;
		
		if (_this.isGeneratedNode(node)) {
			_DEBUG_LOG_TRANSFORM('CallExpression isGeneratedNode', node, node);
			return node;
		}
		
		// No need to wrap if all the arguments are literals or there are no arguments.
		var allLiterals = true;
		var args = node.arguments;
		for (var ic = args.length, i = 0; i < ic; ++i) {
			allLiterals = allLiterals && (
				n.Literal.check(args[i])
				|| (n.AssignmentExpression.check(args[i])
					&& n.Identifier.check(args[i].left)
					&& _this.isLambdaIdentifier(args[i].left)
				)
			);
		}
		
		var joinArguments;
		var retArguments;
		if (allLiterals) {
			// Nothing to join, will generate a direct call.
			joinArguments = [];
			
			// <"x">, <"y">
			retArguments = args;
		}
		else {
			// <x>, <y>
			joinArguments = args.map(function (arg, index) {
				var argPath = path.get('arguments', index);
				
				if (
					n.CallExpression.check(argPath.value)
					&& n.Identifier.check(argPath.value.callee)
					&& _this.isGlobalIdentifier(argPath.value.callee)
				) {
					_this.traverse(argPath.parentPath);
					return argPath.value;
				}
				
				return _this.getReplacementFor(argPath);
			});
			
			// args[0], args[1]
			retArguments = args.map(function (arg, index) {
				return _this.makeNode('memberExpression',
					_this.argsIdentifier,
					_this.makeNode('literal', index),
					true
				);
			});
		}
		
		var calleeThenable = _this.getReplacementFor(path.get('callee'));
		var callInsideJoinThenFunction;
		
		if (calleeThenable === node.callee) {
			callInsideJoinThenFunction = _this.makeNode('callExpression',
				node.callee,
				retArguments
			);
		}
		else {
			// ret(<retArguments>)
			var retCall = _this.makeNode('callExpression',
				_this.retIdentifier,
				retArguments
			);
			
			// return <retCall>;
			var retReturn = _this.makeNode('returnStatement',
				retCall
			);
			
			// function (ret) { <retReturn>; }
			var retThenFunction = _this.makeNode('functionExpression',
				null,
				[ _this.retIdentifier ],
				_this.makeNode('blockStatement', [
					_this.makeLogCall(_this.whenReference),
					retReturn
				])
			);
			
			// <calleeThenable>.then
			var retThenMember = _this.makeNode('memberExpression',
				calleeThenable,
				_this.thenIdentifier,
				false
			);
			
			// <calleeThenable>.then(<retThenFunction>)
			var retThenCall = _this.makeNode('callExpression',
				retThenMember,
				[ retThenFunction ]
			);
			
			callInsideJoinThenFunction = retThenCall;
		}
		
		if (allLiterals) {
			if (_this.isRootExpression(path)) {
				_DEBUG_LOG_TRANSFORM('CallExpression is allLiterals at root', node, callInsideJoinThenFunction);
				return callInsideJoinThenFunction;
			}
			
			if (calleeThenable !== node.callee) {
				_DEBUG_LOG_TRANSFORM('CallExpression is allLiterals and converted to thenable', node, callInsideJoinThenFunction);
				return callInsideJoinThenFunction;
			}
			
			var whenCall = _this.makeNode('callExpression',
				_this.whenReference,
				[ callInsideJoinThenFunction ]
			);
			
			_DEBUG_LOG_TRANSFORM('CallExpression is allLiterals', node, whenCall);
			return whenCall;
		}
		else {
			// return <actualCall>;
			var joinThenReturn = _this.makeNode('returnStatement',
				callInsideJoinThenFunction
			);
			
			// function (args) { <joinThenReturn> }
			var joinThenFunction = _this.makeNode('functionExpression',
				null,
				[ _this.argsIdentifier ],
				_this.makeNode('blockStatement', [
					_this.makeLogCall(_this.whenReference),
					joinThenReturn
				])
			);
			
			// when.join(<joinArguments>);
			var joinCall = _this.makeNode('callExpression',
				_this.whenJoinMember,
				joinArguments
			);
			
			// <joinCall>.then
			var joinThenMember = _this.makeNode('memberExpression',
				joinCall,
				_this.thenIdentifier,
				false
			);
			
			// <joinThenMember>(<joinThenFunction>);
			var joinThenCall = _this.makeNode('callExpression',
				joinThenMember,
				[ joinThenFunction ]
			);
			
			_DEBUG_LOG_TRANSFORM('CallExpression', node, joinThenCall);
			return joinThenCall;
		}
	},
	
	getReplacementForFunctionExpression: function (path) {
		var _this = this;
		var node = path.value;
		
		if (_this.isGeneratedNode(node)) {
			_DEBUG_LOG_TRANSFORM('FunctionExpression isGeneratedNode', node, node);
			return node;
		}
		
		var statements = (
			n.BlockStatement.check(node.body)
				? node.body.body
				: [ _this.makeNode('expressionStatement', node.body) ]
		);
		
		var arrayOfTasks = _this.makeNode('arrayExpression',
			statements.map(function (statement) {
				// Add `return` to thenable statements.
				if (n.ExpressionStatement.check(statement)) {
					statement = _this.makeNode('returnStatement',
						statement.expression
					);
				}
				
				return _this.makeNode('functionExpression',
					null,
					[],
					_this.makeNode('blockStatement',
						[ statement ]
					)
				);
			})
		);
		
		var whenSequenceCall = _this.makeNode('callExpression',
			_this.whenSequenceReference,
			[ arrayOfTasks ]
		);
		
		var returnStatement = _this.makeNode('returnStatement',
			whenSequenceCall
		);
		
		var functionBlockStatement = _this.makeNode('blockStatement',
			[ returnStatement ]
		);
		
		var functionExpression = _this.makeNode('functionExpression',
			node.id,
			node.params,
			functionBlockStatement
		);
		
		_DEBUG_LOG_TRANSFORM('FunctionExpression', node, functionExpression);
		
		return functionExpression;
	},
	
	getReplacementFor: function (path) {
		var _this = this;
		var node = path.value;
		
		if (n.Identifier.check(node)) {
			return _this.getReplacementForIdentifier(path);
		}
		else if (n.MemberExpression.check(node)) {
			return _this.getReplacementForMemberExpression(path);
		}
		else if (n.CallExpression.check(node)) {
			return _this.getReplacementForCallExpression(path);
		}
		else if (n.FunctionExpression.check(node)) {
			return _this.getReplacementForFunctionExpression(path);
		}
		
		return node;
	},
	
	visitIdentifier: function (path) {
		var _this = this;
		
		path.replace(_this.getReplacementForIdentifier(path));
		
		return false;
	},
	
	visitMemberExpression: function (path) {
		var _this = this;
		
		path.replace(_this.getReplacementForMemberExpression(path));
		
		return false;
	},
	
	visitCallExpression: function (path) {
		var _this = this;
		
		path.replace(_this.getReplacementForCallExpression(path));
		
		_this.traverse(path);
	},
	
	visitFunctionExpression: function (path) {
		var _this = this;
		
		path.replace(_this.getReplacementForFunctionExpression(path));
		
		_this.traverse(path);
	},
	
	visitIfStatement: function (path) {
		var _this = this;
		
		if (_this.isLambdaArgumentCheck(path)) {
			return false;
		}
		
		_this.traverse(path);
	},
	
	visitProgram: function (path) {
		var _this = this;
		
		path.get('body').value.unshift(
			_this.makeNode('variableDeclaration',
				'const',
				[
					_this.requireIdentifier,
					_this.syntaxErrorIdentifier
				].map(function (identNode) {
					return _this.makeNode('variableDeclarator',
						identNode,
						identNode
					);
				})
			)
		);
		
		_this.traverse(path);
	}
});


function createOptions(options) {
	options = options || {};
	return {
		require: options.require || makeRandomIdentifierName('__require'),
		console: options.console || makeRandomIdentifierName('__console'),
		ret: options.ret || makeRandomIdentifierName('__ret'),
		globals: extend({}, options.globals || {}),
		lambdas: extend({}, options.lambdas || {})
	};
}

function transformAST(ast, options) {
	options = createOptions(options);
	
	var transformer = new Transformer(options);
	
	types.visit(ast, transformer);
	
	return ast;
}

function transformCode(code, options) {
	// Parse and transform the AST, then compile back into the source code.
	var ast = recast.parse(code);
	
	ast = transformAST(ast, options);
	
	var code = recast.prettyPrint(ast).code;
	
	return code;
}


exports.createOptions = createOptions;
exports.makeRandomIdentifierName = makeRandomIdentifierName;
exports.transformAST = transformAST;
exports.transformCode = transformCode;
