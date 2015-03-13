'use strict';

var inherits = require('util').inherits;

var cppArguments = require('./cpp-arguments');
var promiseHelpers = require('./promise-helpers');


function HTTPResponse() {
	var _this = this;
	
	// The final URL. Will be equal to the original URL, unless redirects have been allowed and took place.
	_this.url = "";
	// HTTP response code.
	_this.code = 0;
	
	promiseHelpers.makeThenable(_this);
	promiseHelpers.makeThenableProperty(_this, 'url');
	promiseHelpers.makeThenableProperty(_this, 'code');
}

function HTTPResponseWithBuffer() {
	HTTPResponse.call(this);
	
	this.body = "";
	
	promiseHelpers.makeThenableProperty(this, 'body');
}
inherits(HTTPResponseWithBuffer, HTTPResponse);

function HTTPResponseWithResultingFileName() {
	HTTPResponse.call(this);
	
	// The file name into which the returned HTTP body has been saved.
	this.body_file_name = "";
	
	promiseHelpers.makeThenableProperty(this, 'body_file_name');
}
inherits(HTTPResponseWithResultingFileName, HTTPResponse);


// Response storage policy.
// The default one is `KeepResponseInMemory()`, which can be omitted.
// The alternative one is `SaveResponseToFile(file_name)`.
function KeepResponseInMemory() {
	if (!(this instanceof KeepResponseInMemory)) {
		return new KeepResponseInMemory();
	}
}

function SaveResponseToFile(file_name) {
	if (!(this instanceof SaveResponseToFile)) {
		return new SaveResponseToFile(file_name);
	}
	
	var _this = this;
	
	_this.file_name = "";
	
	cppArguments.assert('SaveResponseToFile', [
		[
			cppArguments.assertion('string', 'const std::string&', 'file_name'),
			function (file_name) {
				_this.file_name = file_name;
			}
		]
	], arguments);
}


module.exports.HTTPResponse = HTTPResponse;
module.exports.HTTPResponseWithBuffer = HTTPResponseWithBuffer;
module.exports.HTTPResponseWithResultingFileName = HTTPResponseWithResultingFileName;
module.exports.KeepResponseInMemory = KeepResponseInMemory;
module.exports.SaveResponseToFile = SaveResponseToFile;
