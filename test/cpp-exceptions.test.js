var assert = require('assert');

describe('cpp-exceptions', function () {
	var cppExceptions = require('../lib/cpp-exceptions');
	
	var Exception = cppExceptions.Exception;
	
	it('should export `Exception` function', function () {
		assert.equal('function', typeof Exception);
	});
	
	describe('Exception', function () {
		it('should be a function', function () {
			assert.equal('function', typeof Exception);
		});
		
		it('should create instances derived from `Exception`', function () {
			var ex = Exception();
			
			assert.equal(true, ex instanceof Exception);
		});
		
		it('should create instances derived from `Error`', function () {
			var ex = Exception();
			
			assert.equal(true, ex instanceof Error);
		});
		
		it('should create instances with the `name` equal to "Exception"', function () {
			var ex = Exception();
			
			assert.equal('Exception', ex.name);
		});
		
		it('should create instances with a `message` and a `stack` properties', function () {
			var ex = Exception('MESSAGE');
			
			assert.equal('MESSAGE', ex.message);
			assert.equal(true, ex.stack && ex.stack.indexOf('Exception: MESSAGE\n') === 0);
		});
	});
	
	it('should export makeCppException function', function () {
		assert.equal('function', typeof cppExceptions.makeCppException);
	});
	
	describe('makeCppException', function () {
		var makeCppException = cppExceptions.makeCppException;
		
		it('should return a function', function () {
			assert.equal('function', typeof makeCppException(Error, 'TestException'));
		});
		
		describe('function returned from `makeCppException`', function () {
			var TestException;
		
			beforeEach(function () {
				TestException = makeCppException(Error, 'TestException');
			});
			
			it('should allow creation with `new`', function () {
				var ex = new TestException();
				
				assert.equal(true, ex instanceof TestException);
				assert.equal(true, ex instanceof Error);
				assert.equal('TestException', ex.name);
				assert.equal(TestException, ex.constructor);
			});
			
			it('should allow creation without `new`', function () {
				var ex = TestException();
				
				assert.equal(true, ex instanceof TestException);
				assert.equal(true, ex instanceof Error);
				assert.equal('TestException', ex.name);
				assert.equal(TestException, ex.constructor);
			});
			
			it('should maintain the inheritance chain', function () {
				var DerivedException = makeCppException(TestException, 'DerivedException');
				var MoreDerivedException = makeCppException(DerivedException, 'MoreDerivedException');
				
				var ex = MoreDerivedException('MESSAGE');
				
				assert.equal(true, ex instanceof MoreDerivedException);
				assert.equal(true, ex instanceof DerivedException);
				assert.equal(true, ex instanceof Error);
				assert.equal('MoreDerivedException', ex.name);
				assert.equal(MoreDerivedException, ex.constructor);
				assert.equal('MESSAGE', ex.message);
			});
		});
	});
});
