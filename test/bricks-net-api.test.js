var assert = require('assert');

describe('bricks-net-api', function () {
	var api = require('../lib/bricks-net-api');
	
	it('should export `GET` function', function () {
		assert.equal('function', typeof api.GET);
	});
	
	it('should export `POST` function', function () {
		assert.equal('function', typeof api.POST);
	});
	
	it('should export `POSTFromFile` function', function () {
		assert.equal('function', typeof api.POSTFromFile);
	});
	
	it('should export `HTTP` function', function () {
		assert.equal('function', typeof api.HTTP);
	});
	
	describe('`GET` function', function () {
		it('should return an instance of `GET` class', function () {
			assert.equal(true, api.GET("url") instanceof api.GET);
		});
	});
	
	describe('`POST` function', function () {
		it('should return an instance of `POST` class', function () {
			assert.equal(true, api.POST("url") instanceof api.POST);
		});
	});
	
	describe('`POSTFromFile` function', function () {
		it('should return an instance of `POSTFromFile` class', function () {
			assert.equal(true, api.POSTFromFile("url", __filename, "application/javascript") instanceof api.POSTFromFile);
		});
	});
});
