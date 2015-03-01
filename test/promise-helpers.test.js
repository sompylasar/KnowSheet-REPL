var assert = require('assert');

var when = require('when');

describe('promise-helpers', function () {
	var promiseHelpers = require('../lib/promise-helpers');
	
	it('should export `makeThenable` function', function () {
		assert.equal('function', typeof promiseHelpers.makeThenable);
	});
	
	it('should export `makeThenableProperty` function', function () {
		assert.equal('function', typeof promiseHelpers.makeThenableProperty);
	});
	
	describe('`makeThenable` function', function () {
		it('should return the passed owner', function () {
			var owner = {};
			var returnedValue = promiseHelpers.makeThenable(owner);
			assert.strictEqual(owner, returnedValue);
		});
		
		it('should convert an object to a promise-like with a `resolver` and a `promise`', function (done) {
			var owner = {};
			var resolveValue = {};
			promiseHelpers.makeThenable(owner);
			
			assert.equal(true, when.isPromiseLike(owner), 'isPromiseLike');
			
			assert.equal('object', typeof owner.resolver, 'contains `resolver` object');
			assert.equal('function', typeof owner.resolver.resolve, '`resolver` has `resolve` function');
			assert.equal('function', typeof owner.resolver.reject, '`resolver` has `reject` function');
			
			assert.equal('object', typeof owner.promise, 'contains `promise` object');
			assert.equal(true, when.isPromiseLike(owner.promise), '`promise` isPromiseLike');
			
			when(owner).then(function (value) {
				assert.strictEqual(resolveValue, value);
				done();
			}).done(undefined, done);
			
			owner.resolver.resolve(resolveValue);
		});
		
		it('should allow resolving to itself', function (done) {
			var owner = {};
			promiseHelpers.makeThenable(owner);
			
			when(owner).then(function (value) {
				assert.strictEqual(owner, value);
				done();
			}).done(undefined, done);
			
			owner.resolver.resolve(owner);
		});
		
		it('should reject as expected', function (done) {
			var owner = {};
			var rejectValue = new Error('REJECTION');
			promiseHelpers.makeThenable(owner);
			
			when(owner).then(function (value) {
				done(new Error('Resolved instead of rejected.'));
			}, function (err) {
				assert.strictEqual(rejectValue, err);
				done();
			}).done(undefined, done);
			
			owner.resolver.reject(rejectValue);
		});
	});
	
	describe('`makeThenableProperty` function', function () {
		it('should return the property promise', function () {
			var owner = {
				property: "test"
			};
			promiseHelpers.makeThenable(owner);
			var returnedValue = promiseHelpers.makeThenableProperty(owner, 'property');
			
			assert.strictEqual(owner.property, returnedValue);
		});
		
		it('should convert a property to a promise', function (done) {
			var owner = {
				property: "test"
			};
			var resolveValue = {};
			promiseHelpers.makeThenable(owner);
			promiseHelpers.makeThenableProperty(owner, 'property');
			
			assert.equal(true, when.isPromiseLike(owner.property), 'isPromiseLike');
			
			when(owner.property).then(function (value) {
				assert.strictEqual("test", value);
				done();
			}).done(undefined, done);
			
			owner.resolver.resolve(resolveValue);
		});
		
		it('should reject a property promise to the owner\'s rejection', function (done) {
			var owner = {
				property: "test"
			};
			var rejectValue = new Error('REJECTION');
			promiseHelpers.makeThenable(owner);
			promiseHelpers.makeThenableProperty(owner, 'property');
			
			when(owner.property).then(function (value) {
				done(new Error('Resolved instead of rejected.'));
			}, function (err) {
				assert.strictEqual(rejectValue, err);
				done();
			}).done(undefined, done);
			
			owner.resolver.reject(rejectValue);
		});
		
		it('should convert a property to a promise without `makeThenable`', function (done) {
			var owner = {
				property: "test"
			};
			var resolveValue = {};
			promiseHelpers.makeThenableProperty(owner, 'property');
			
			assert.equal(true, when.isPromiseLike(owner.property), 'isPromiseLike');
			
			when(owner.property).then(function (value) {
				assert.strictEqual("test", value);
				done();
			}).done(undefined, done);
		});
	});
});
