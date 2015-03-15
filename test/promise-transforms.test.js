var assert = require('assert');

var recast = require('recast');

var extend = require('../lib/extend');

function prettyPrint(code) {
	return recast.prettyPrint(recast.parse(code)).code;
}

function assertTransformed(source, expected, actual) {
	source = prettyPrint(source);
	expected = prettyPrint(expected);
	actual = prettyPrint(actual);
	
	assert.strictEqual(
		expected,
		actual,
		'\n' +
		'## Source:\n' + source + '\n\n' +
		'## Expected:\n' + expected + '\n\n' +
		'## Actual:\n' + actual + '\n\n'
	);
	
	if (process.env.NODE_ENV === 'development') {
		console.log('\n\n' +
			'## Source:\n' + source + '\n\n' +
			'## OK:\n' + actual + '\n'
		);
	}
}

describe('promise-transforms', function () {
	var transforms = require('../lib/promise-transforms');
	var transformOptions = {
		require: 'require',
		console: 'console',
		ret: 'ret'
	};
	
	it('transforms `a` correctly', function () {
		var source = 'a';
		var expected = ('' +
		'	require("when")(a);' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b` correctly', function () {
		var source = 'a.b';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b.c` correctly', function () {
		var source = 'a.b.c';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b;' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b.c.d` correctly', function () {
		var source = 'a.b.c.d';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b;' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c;' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.d;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a()` correctly', function () {
		var source = 'a()';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret();' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a(x)` correctly', function () {
		var source = 'a(x)';
		var expected = ('' +
		'	require("when").join(' +
		'		require("when")(x)' +
		'	)' +
		'		.then(function (args) {' +
		'			return require("when")(a)' +
		'				.then(function (ret) {' +
		'					return ret(args[0]);' +
		'				});' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a(x, y)` correctly', function () {
		var source = 'a(x, y)';
		var expected = ('' +
		'	require("when").join(' +
		'		require("when")(x),' +
		'		require("when")(y)' +
		'	)' +
		'		.then(function (args) {' +
		'			return require("when")(a)' +
		'				.then(function (ret) {' +
		'					return ret(args[0], args[1]);' +
		'				});' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a(1, "2")` correctly', function () {
		var source = 'a(1, "2")';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret(1, "2");' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b()` correctly', function () {
		var source = 'a.b()';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b.bind(ret);' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret();' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b().c` correctly', function () {
		var source = 'a.b().c';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b.bind(ret);' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret();' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b().c()` correctly', function () {
		var source = 'a.b().c()';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b.bind(ret);' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret();' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c.bind(ret);' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret();' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b(x, y)` correctly', function () {
		var source = 'a.b(x, y)';
		var expected = ('' +
		'	require("when").join(' +
		'		require("when")(x),' +
		'		require("when")(y)' +
		'	)' +
		'		.then(function (args) {' +
		'			return require("when")(a)' +
		'				.then(function (ret) {' +
		'					return ret.b.bind(ret);' +
		'				})' +
		'				.then(function (ret) {' +
		'					return ret(args[0], args[1]);' +
		'				});' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b(x, y).c` correctly', function () {
		var source = 'a.b(x, y).c';
		var expected = ('' +
		'	require("when").join(' +
		'		require("when")(x),' +
		'		require("when")(y)' +
		'	)' +
		'		.then(function (args) {' +
		'			return require("when")(a)' +
		'				.then(function (ret) {' +
		'					return ret.b.bind(ret);' +
		'				})' +
		'				.then(function (ret) {' +
		'					return ret(args[0], args[1]);' +
		'				});' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms `a.b(1, "2").c` correctly', function () {
		var source = 'a.b(1, "2").c';
		var expected = ('' +
		'	require("when")(a)' +
		'		.then(function (ret) {' +
		'			return ret.b.bind(ret);' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret(1, "2");' +
		'		})' +
		'		.then(function (ret) {' +
		'			return ret.c;' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, transformOptions);
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms code with function calls correctly', function () {
		var source = ('' +
		'	HTTP(GET("localhost:2015/test?a=b"))' +
		'');
		var expected = ('' +
		'	require("when").join(' +
		'		require("when")(GET("localhost:2015/test?a=b"))' +
		'	).then(function (args) {' +
		'		return HTTP(args[0]);' +
		'	})' +
		'');
		
		var actual = transforms.transformCode(source, extend(extend({}, transformOptions), {
			globals: {
				"HTTP": "HTTP",
				"GET": "GET"
			}
		}));
		
		assertTransformed(source, expected, actual);
	});
	
	it('transforms code with a lambda correctly', function () {
		var source = ('' +
		'	HTTP(2015).Register("/test", __lambda = function __lambda(r) {' +
		'		if (r === undefined) {' +
		'			throw __SyntaxError("Argument \\"r\\" missing from the call to [](Request r).");' +
		'		}' +
		'		r(JSON(r.url.ComposeURL()));' +
		'	});' +
		'');
		var expected = ('' +
		// HTTP(2015)
		'	require("when")(HTTP(2015))' +
		// HTTP(2015).Register
		'		.then(function (ret) {' +
		'			return ret.Register.bind(ret);' +
		'		})' +
		// HTTP(2015).Register("/test", ...)
		'		.then(function (ret) {' +
		'			return ret("/test", __lambda = function __lambda(r) {' +
		'				return require("when/sequence")([' +
		'					function () {' +
		'						if (r === undefined) {' +
		'							throw __SyntaxError("Argument \\"r\\" missing from the call to [](Request r).");' +
		'						}' +
		'					},' +
		'					function () {' +
		// r(...)
		'						return require("when").join(' +
		// JSON(...)
		'							require("when").join(' +
		//     r
		'								require("when")(r)' +
		//     -> r.url
		'									.then(function (ret) {' +
		'										return ret.url;' +
		'									})' +
		//     -> r.url.ComposeURL
		'									.then(function (ret) {' +
		'										return ret.ComposeURL.bind(ret);' +
		'									})' +
		//     -> r.url.ComposeURL()
		'									.then(function (ret) {' +
		'										return ret();' +
		'									})' +
		'							)' +
		'							.then(function (args) {' +
		// -> JSON(...)
		'								return JSON(args[0]);' +
		'							})' +
		'						)' +
		'						.then(function (args) {' +
		// -> r(...)
		'							return require("when")(r)' +
		'								.then(function (ret) {' +
		'									return ret(args[0]);' +
		'								});' +
		'						})' +
		'					}' +
		'				]);' +
		'			});' +
		'		});' +
		'');
		var actual = transforms.transformCode(source, extend(extend({}, transformOptions), {
			globals: {
				"GlobalFn": "GlobalFn",
				"SyntaxError": "__SyntaxError",
				"HTTP": "HTTP",
				"GET": "GET",
				"JSON": "JSON"
			},
			lambdas: {
				"__lambda": "__lambda"
			}
		}));
		
		assertTransformed(source, expected, actual);
	});
});
