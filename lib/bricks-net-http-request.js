'use strict';

var inherits = require('util').inherits;

var cppArguments = require('./cpp-arguments');

var HTTPHeaders = require('./bricks-net-http-headers').HTTPHeaders;


function DefaultContentType() { return "text/plain"; }


function HTTPRequestBase() {
	var _this = this;
	
	_this.url = "";
	_this.custom_user_agent = "";
	_this.allow_redirects = false;
	_this.extra_headers = HTTPHeaders().headers;
	
	cppArguments.assert('HTTPRequestBase', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeaders&', 'extra_headers'),
			function (url, extra_headers) {
				_this.url = url;
				_this.extra_headers = extra_headers.headers;
			}
		]
	], arguments);
}
HTTPRequestBase.prototype.UserAgent = function (new_custom_user_agent) {
	cppArguments.assert('HTTPRequestBase::UserAgent', [
		[ cppArguments.assertion('string', 'const std::string&', 'new_custom_user_agent') ]
	], arguments);
	
	this.custom_user_agent = new_custom_user_agent;
	
	return this;
};
HTTPRequestBase.prototype.AllowRedirects = function (allow_redirects_setting) {
	cppArguments.assert('HTTPRequestBase::AllowRedirects', [
		[ cppArguments.assertion('bool', 'bool', 'allow_redirects_setting', cppArguments.ASSERTION_MODE_OPTIONAL) ]
	], arguments);
	
	if (typeof allow_redirects_setting === 'undefined') {
		allow_redirects_setting = true;
	}
	
	this.allow_redirects = allow_redirects_setting;
	
	return this;
};


function GET() {
	var _this = this;
	
	if (!(_this instanceof GET)) {
		// TODO(sompylasar): Abstract this away.
		// HACK: Cannot use `apply` to call a constructor with the exact number of arguments.
		switch (arguments.length) {
			case 0:
				// HACK: We know `GET` `cppArguments.assert` will throw on this.
				_this = new GET();
				/* istanbul ignore next: previous statement should throw */ break;
			
			case 1:
				_this = new GET(arguments[0]);
				break;
			
			case 2:
				_this = new GET(arguments[0], arguments[1]);
				break;
			
			default:
				// HACK: We know `GET` `cppArguments.assert` will throw on this.
				_this = new GET(arguments[0], arguments[1], arguments[2]);
				/* istanbul ignore next: previous statement should throw */ break;
		}
		return _this;
	}
	
	cppArguments.assert('GET', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeaders&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (url, extra_headers) {
				if (typeof extra_headers === 'undefined') {
					extra_headers = HTTPHeaders();
				}
				
				HTTPRequestBase.call(_this, url, extra_headers);
			}
		]
	], arguments);
}
inherits(GET, HTTPRequestBase);


function POST() {
	var _this = this;
	
	if (!(_this instanceof POST)) {
		// TODO(sompylasar): Abstract this away.
		// HACK: Cannot use `apply` to call a constructor with the exact number of arguments.
		switch (arguments.length) {
			case 0:
				// HACK: We know `POST` `cppArguments.assert` will throw on this.
				_this = new POST();
				/* istanbul ignore next: previous statement should throw */ break;
			
			case 1:
				_this = new POST(arguments[0]);
				break;
			
			case 2:
				_this = new POST(arguments[0], arguments[1]);
				break;
			
			case 3:
				_this = new POST(arguments[0], arguments[1], arguments[2]);
				break;
			
			case 4:
				_this = new POST(arguments[0], arguments[1], arguments[2], arguments[3]);
				break;
			
			default:
				// HACK: We know `POST` `cppArguments.assert` will throw on this.
				_this = new POST(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4]);
				/* istanbul ignore next: previous statement should throw */ break;
		}
		return _this;
	}
	
	_this.has_body = false;
	_this.body = "";
	_this.content_type = DefaultContentType();
	
	cppArguments.assert('POST', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			function (url) {
				HTTPRequestBase.call(_this, url, HTTPHeaders());
			}
		],
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('string', 'const std::string&', 'body'),
			cppArguments.assertion('string', 'const std::string&', 'content_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeaders&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (url, body, content_type, extra_headers) {
				if (typeof content_type === 'undefined') {
					content_type = DefaultContentType();
				}
				
				if (typeof extra_headers === 'undefined') {
					extra_headers = HTTPHeaders();
				}
				
				HTTPRequestBase.call(_this, url, extra_headers);
				
				_this.has_body = true;
				_this.body = body;
				_this.content_type = content_type;
			}
		],
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('object', 'const T&', 'object'),
			cppArguments.assertion('string', 'const std::string&', 'content_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeaders&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (url, object, content_type, extra_headers) {
				if (typeof content_type === 'undefined') {
					content_type = "application/json";
				}
				
				if (typeof extra_headers === 'undefined') {
					extra_headers = HTTPHeaders();
				}
				
				HTTPRequestBase.call(_this, url, extra_headers);
				
				_this.has_body = true;
				_this.body = JSON.stringify({ data: object });
				_this.content_type = content_type;
			}
		]
	], arguments);
}
inherits(POST, HTTPRequestBase);


function POSTFromFile(url, file_name, content_type) {
	var _this = this;
	
	if (!(_this instanceof POSTFromFile)) {
		_this = new POSTFromFile(url, file_name, content_type);
		return _this;
	}
	
	_this.file_name = "";
	_this.content_type = "";
	
	cppArguments.assert('POSTFromFile', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('string', 'const std::string&', 'file_name'),
			cppArguments.assertion('string', 'const std::string&', 'content_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeaders&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (url, file_name, content_type, extra_headers) {
				if (typeof content_type === 'undefined') {
					content_type = DefaultContentType();
				}
				
				if (typeof extra_headers === 'undefined') {
					extra_headers = HTTPHeaders();
				}
				
				HTTPRequestBase.call(_this, url, extra_headers);
	
				_this.file_name = file_name;
				_this.content_type = content_type;
			}
		]
	], arguments);
}
inherits(POSTFromFile, HTTPRequestBase);


exports.DefaultContentType = DefaultContentType;

exports.HTTPRequestBase = HTTPRequestBase;
exports.GET = GET;
exports.POST = POST;
exports.POSTFromFile = POSTFromFile;
