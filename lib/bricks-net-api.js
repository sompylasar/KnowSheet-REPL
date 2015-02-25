'use strict';

var GET = require('./bricks-net-api-types').GET;
var POST = require('./bricks-net-api-types').POST;
var POSTFromFile = require('./bricks-net-api-types').POSTFromFile;
var HTTP = require('./bricks-net-api-types').HTTP;

var HTTPResponse = require('./bricks-net-api-types').HTTPResponse;

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;
var HTTPResponseCodeAsString = require('./bricks-net-http-codes').HTTPResponseCodeAsString;


exports.HTTPResponse = HTTPResponse;
exports.HTTPResponseCode = HTTPResponseCode;
exports.HTTPResponseCodeAsString = HTTPResponseCodeAsString;

exports.GET = GET;
exports.POST = POST;
exports.POSTFromFile = POSTFromFile;

exports.HTTP = HTTP;
