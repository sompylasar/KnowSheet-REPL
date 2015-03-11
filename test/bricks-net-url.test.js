var assert = require('assert');

describe('bricks-net-url', function () {
	var URL = require('../lib/bricks-net-url').URL;
	var EmptyURLException = require('../lib/bricks-net-url').EmptyURLException;
	
	it('should export `URL` function', function () {
		assert.equal('function', typeof URL);
	});
	
	it('should export `EmptyURLException` function', function () {
		assert.equal('function', typeof EmptyURLException);
	});
	
	describe('`URL`', function () {
		it('should create default URL from empty arguments', function () {
			var url = URL();
			assert.strictEqual('http', url.scheme);
			assert.strictEqual('', url.host);
			assert.strictEqual(0, url.port);
			assert.strictEqual('/', url.path);
			assert.deepEqual([], url.parameters_vector);
			assert.equal('object', typeof url.query);
			assert.equal('function', typeof url.query.has);
			assert.equal('function', typeof url.query.get);
			assert.strictEqual(false, url.query.has('foo'));
			assert.strictEqual('', url.query.get('foo'));
			assert.strictEqual('DEFAULT', url.query.get('foo', 'DEFAULT'));
			assert.strictEqual('', url.fragment);
			assert.strictEqual('', url.url_without_parameters);
		});
		
		// Read the C++ tests for `URL`.
		var cppTest = require('fs').readFileSync(__dirname + '/bricks-net-url.test.cc');
		
		// Convert C++ tests to JS tests.
		cppTest = String(cppTest);
		
		cppTest = cppTest.replace(/^\s*#include.*$/gm, '');
		cppTest = cppTest.replace(/^\s*using .*$/gm, '');
		
		cppTest = cppTest.replace(/TEST\([a-zA-Z0-9_]+, ([a-zA-Z0-9_]+)\) \{/gm, function (m, testName) {
			return "it('" + testName + "', _test_" + testName + "); function _test_" + testName + "() {";
		});
		
		cppTest = cppTest.replace(/EXPECT_EQ\("((?:[^"\\]|\\.)*)", ([a-zA-Z0-9_]+)\.query\["((?:[^"\\]|\\.)*)"\]\);/gm, 'assert.equal("$1", $2.query.get("$3"));');
		
		cppTest = cppTest.replace(/EXPECT_EQ\(/gm, 'assert.strictEqual(');
		cppTest = cppTest.replace(/ASSERT_THROW\((.+?), ([a-zA-Z0-9_]+)\);/gm, 'assert.throws(function () { $1; }, $2);');
		cppTest = cppTest.replace(/URL u;/gm, 'var u;');
		cppTest = cppTest.replace(/URL u\(/gm, 'var u = URL(');
		
		if (process.env.NODE_ENV === 'development') {
			// Print the source code we're going to evaluate, with line numbers for debugging.
			console.log(cppTest.split('\n').map(function (line, index) {
				return ((index+1) + '| ' + line);
			}).join('\n'));
		}
		
		// Run the C++ tests.
		eval(cppTest);
	});
});
