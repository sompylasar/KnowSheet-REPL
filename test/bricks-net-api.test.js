var assert = require('assert');
var when = require('when');

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
	
	it('should export `HTTPResponse` function', function () {
		assert.equal('function', typeof api.HTTPResponse);
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
	
	describe('`HTTP` function', function () {
		var http = require('http');
		var server;
		var sockets = [];
		
		beforeEach(function (done) {
			server = http.createServer();
			server.on('connection', function (socket) {
				sockets.push(socket);
				socket.on('close', function () {
					var index = sockets.indexOf(socket);
					if (index >= 0) {
						sockets.splice(index, 1);
					}
				});
			});
			server.on('request', function (request, response) {
				response.end('OK');
			});
			server.on('listening', function () {
				done();
			});
			server.listen(20000);
		});
		afterEach(function (done) {
			server.close(function () {
				done();
			});
			while (sockets.length > 0) {
				sockets.shift().destroy();
			}
		});
		
		it('should make a `GET` request', function (done) {
			var response = api.HTTP(api.GET("localhost:20000/test"));
			
			assert.equal(true, when.isPromiseLike(response));
			
			when(response).then(function (response) {
				assert.equal(false, when.isPromiseLike(response));
				assert.equal(true, response instanceof api.HTTPResponse);
				assert.equal('OK', response.body);
				done();
			}).done(void 0, done);
		});
	});
});
