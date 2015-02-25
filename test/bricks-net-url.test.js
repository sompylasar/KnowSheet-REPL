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
	
	describe('`URL` function', function () {
		it('should throw `EmptyURLException` on empty url', function () {
			assert.throws(function () {
				URL("");
			}, EmptyURLException);
		});
	});
});
