var assert = require('assert');

describe('cpp-arguments', function () {
	var cppExceptions = require('../lib/cpp-arguments');
	
	it('should export `assert` function', function () {
		assert.equal('function', typeof cppExceptions.assert);
	});
	
	it('should export `assertion` function', function () {
		assert.equal('function', typeof cppExceptions.assertion);
	});
	
	it('should export `ASSERTION_MODE_OPTIONAL`', function () {
		assert.notEqual('undefined', typeof cppExceptions.ASSERTION_MODE_OPTIONAL);
	});
	
	it('should export `ASSERTION_MODE_VARARGS`', function () {
		assert.notEqual('undefined', typeof cppExceptions.ASSERTION_MODE_VARARGS);
	});
	
	describe('`assertion` function', function () {
		it('should create assertions for base assertion types', function () {
			function TestObject() {}
			
			var baseAssertions = {
				'bool': false,
				'string': "abc",
				'int': 123,
				'double': 0.5,
				'object': new TestObject(),
				'plainObject': {}
			};
			var baseAssertionsNegative = {
				'bool': "abc",
				'string': 123,
				'int': 0.5,
				'double': {},
				'object': false,
				'plainObject': new TestObject()
			};
			
			Object.keys(baseAssertions).forEach(function (assertionName) {
				var assertion = cppExceptions.assertion(assertionName, 'T_' + assertionName, 'test_' + assertionName);
			
				assert.equal('function', typeof assertion.check);
				assert.equal('function', typeof assertion.toString);
				assert.equal('T_' + assertionName + ' test_' + assertionName, assertion.toString());
				assert.strictEqual(true, assertion.check(baseAssertions[assertionName]));
				assert.strictEqual(false, assertion.check(baseAssertionsNegative[assertionName]));
			});
		});
		
		it('should create an assertion from a function', function () {
			var TEST = { assertionTestResult: 1 };
			var assertion = cppExceptions.assertion(function (value) {
				return value;
			}, 'T', 'test');
			
			assert.equal('function', typeof assertion.check);
			assert.equal('function', typeof assertion.toString);
			assert.equal('T test', assertion.toString());
			assert.strictEqual(TEST, assertion.check(TEST));
		});
		
		it('should create an optional argument assertion', function () {
			var assertion = cppExceptions.assertion('string', 'T', 'test', cppExceptions.ASSERTION_MODE_OPTIONAL);
			
			assert.equal('function', typeof assertion.check);
			assert.equal('function', typeof assertion.toString);
			assert.equal('T test', assertion.toString());
			assert.strictEqual(cppExceptions.ASSERTION_MODE_OPTIONAL, assertion.mode);
		});
		
		it('should create a variable arguments assertion', function () {
			var assertion = cppExceptions.assertion(null, null, null, cppExceptions.ASSERTION_MODE_VARARGS);
			
			assert.equal('function', typeof assertion.check);
			assert.equal('function', typeof assertion.toString);
			assert.equal('...', assertion.toString());
			assert.strictEqual(true, assertion.check());
			assert.strictEqual(cppExceptions.ASSERTION_MODE_VARARGS, assertion.mode);
		});
	});
	
	describe('`assert` function', function () {
		var emptySignature = [];
		var singleArgumentSignature = [
			cppExceptions.assertion('string', 'T', 'test')
		];
		var twoArgumentSignatureCallbackCalled = 0;
		var twoArgumentSignature = [
			cppExceptions.assertion('string', 'T', 'test_string'),
			cppExceptions.assertion('int', 'T', 'test_int'),
			function () {
				twoArgumentSignatureCallbackCalled++;
			}
		];
		var optionalArgumentSignature = [
			cppExceptions.assertion('string', 'T', 'test_string'),
			cppExceptions.assertion('int', 'T', 'test_int', cppExceptions.ASSERTION_MODE_OPTIONAL)
		];
		var varargsSignature = [
			cppExceptions.assertion('string', 'T', 'test_string'),
			cppExceptions.assertion(null, null, null, cppExceptions.ASSERTION_MODE_VARARGS)
		];
		var callbackSignatureCallbackCalled = 0;
		var callbackSignature = [
			cppExceptions.assertion('string', 'T', 'test'),
			function () {
				callbackSignatureCallbackCalled++;
			}
		];
		var objectSignatureCallbackArguments = undefined;
		var objectSignature = [
			cppExceptions.assertion('object', 'T', 'test_object'),
			cppExceptions.assertion('string', 'T', 'test_string'),
			cppExceptions.assertion('int', 'T', 'test_int'),
			function () {
				objectSignatureCallbackArguments = arguments;
			}
		];
		
		it('should accept no signatures', function () {
			cppExceptions.assert('TestMethod', [], []);
		});
		
		it('should accept empty signature', function () {
			cppExceptions.assert('TestMethod', [
				emptySignature
			], []);
		});
		
		it('should select empty signature if other ones do not match', function () {
			var optionalArgumentSignatureCalled = 0;
			cppExceptions.assert('TestMethod', [
				emptySignature,
				[].concat(optionalArgumentSignature).concat(function () {
					++optionalArgumentSignatureCalled;
				})
			], []);
			assert.equal(0, optionalArgumentSignatureCalled);
		});
		
		it('should throw if too many arguments for empty signature', function () {
			assert.throws(function () {
				cppExceptions.assert('TestMethod', [
					emptySignature
				], [
					123
				]);
			}, /^Error: TestMethod\(\): Too many arguments passed\.$/);
		});
		
		it('should throw if too many arguments for non-empty signature', function () {
			assert.throws(function () {
				cppExceptions.assert('TestMethod', [
					singleArgumentSignature
				], [
					123,
					456
				]);
			}, /^Error: TestMethod\(T test\): Too many arguments passed\.$/);
		});
		
		it('should throw if too little arguments for non-empty signature', function () {
			assert.throws(function () {
				cppExceptions.assert('TestMethod', [
					singleArgumentSignature
				], [
				]);
			}, /^Error: TestMethod\(T test\): Argument #0 `test` must be of type `T`, got `undefined`\.$/);
		});
		
		it('should not throw if too little arguments for signature with optional argument', function () {
			assert.doesNotThrow(function () {
				cppExceptions.assert('TestMethod', [
					optionalArgumentSignature
				], [
					"abc"
				]);
			});
		});
		
		it('should not throw if too little arguments for signature with variable number of arguments', function () {
			assert.doesNotThrow(function () {
				cppExceptions.assert('TestMethod', [
					varargsSignature
				], [
					"abc"
				]);
			});
		});
		
		it('should not throw if too many arguments for signature with variable number of arguments', function () {
			assert.doesNotThrow(function () {
				cppExceptions.assert('TestMethod', [
					varargsSignature
				], [
					"abc",
					123,
					456,
					"def"
				]);
			});
		});
		
		it('should call the callback of the matching signature if given', function () {
			callbackSignatureCallbackCalled = 0;
			
			cppExceptions.assert('TestMethod', [
				callbackSignature
			], [
				"abc"
			]);
			
			assert.strictEqual(1, callbackSignatureCallbackCalled);
		});
		
		it('should call the callback of the matching signature for many signatures', function () {
			twoArgumentSignatureCallbackCalled = 0;
			callbackSignatureCallbackCalled = 0;
			
			cppExceptions.assert('TestMethod', [
				twoArgumentSignature,
				callbackSignature
			], [
				"abc",
				123
			]);
			
			assert.strictEqual(1, twoArgumentSignatureCallbackCalled);
			assert.strictEqual(0, callbackSignatureCallbackCalled);
		});
		
		it('should pass values to the callback', function () {
			var TEST_OBJECT = { "test": { "foo": 123 } };
			
			objectSignatureCallbackArguments = undefined;
			
			cppExceptions.assert('TestMethod', [
				objectSignature
			], [
				TEST_OBJECT,
				"string",
				123
			]);
			
			assert.notStrictEqual(undefined, objectSignatureCallbackArguments);
			assert.strictEqual(3, objectSignatureCallbackArguments.length);
			assert.deepEqual(TEST_OBJECT, objectSignatureCallbackArguments[0]);
			assert.deepEqual("string", objectSignatureCallbackArguments[1]);
			assert.deepEqual(123, objectSignatureCallbackArguments[2]);
		});
		
		it('should not modify passed signatures and values', function () {
			var signatures = [
				emptySignature,
				[
					cppExceptions.assertion('object', 'T', 'test_object'),
					cppExceptions.assertion('int', 'T', 'test_int')
				]
			];
			var values = [
				{ test: "abc" },
				123
			];
			// HACK(sompylasar): Using `JSON.stringify` here as a quick checksum for a nested object.
			var signaturesChecksum = JSON.stringify(signatures);
			var valuesChecksum = JSON.stringify(values);
			
			cppExceptions.assert('TestMethod', signatures, values);
			
			assert.equal(signaturesChecksum, JSON.stringify(signatures));
			assert.equal(valuesChecksum, JSON.stringify(values));
		});
		
		it('should return the handler return value', function () {
			var retval = {};
			var signatures = [
				[].concat(emptySignature).concat(function () {
					return retval;
				})
			];
			var values = [];
			
			assert.strictEqual(retval,
				cppExceptions.assert('TestMethod', signatures, values));
		});
		
		it('should call the handler with the passed context', function () {
			var context = {};
			var signatures = [
				[].concat(emptySignature).concat(function () {
					assert.strictEqual(context, this);
				})
			];
			var values = [];
			
			cppExceptions.assert('TestMethod', signatures, values, context);
		});
	});
});
