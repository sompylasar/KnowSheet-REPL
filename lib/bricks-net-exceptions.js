'use strict';

var makeCppException = require('./cpp-exceptions').makeCppException;
var Exception = require('./cpp-exceptions').Exception;

// All exceptions are derived from NetworkException.
exports.NetworkException = makeCppException(Exception, "NetworkException");

// TCP-level exceptions are derived from SocketException.
exports.SocketException = makeCppException(exports.NetworkException, "SocketException");

exports.InvalidSocketException = makeCppException(exports.SocketException, "InvalidSocketException");
exports.AttemptedToUseMovedAwayConnection = makeCppException(exports.SocketException, "AttemptedToUseMovedAwayConnection");
exports.SocketCreateException = makeCppException(exports.SocketException, "SocketCreateException");

exports.ServerSocketException = makeCppException(exports.SocketException, "ServerSocketException");
exports.SocketBindException = makeCppException(exports.ServerSocketException, "SocketBindException");
exports.SocketListenException = makeCppException(exports.ServerSocketException, "SocketListenException");
exports.SocketAcceptException = makeCppException(exports.ServerSocketException, "SocketAcceptException");

exports.ConnectionResetByPeer = makeCppException(exports.SocketException, "ConnectionResetByPeer");

exports.ClientSocketException = makeCppException(exports.SocketException, "ClientSocketException");
exports.SocketConnectException = makeCppException(exports.ClientSocketException, "SocketConnectException");
exports.SocketResolveAddressException = makeCppException(exports.ClientSocketException, "SocketResolveAddressException");

exports.SocketFcntlException = makeCppException(exports.SocketException, "SocketFcntlException");
exports.SocketReadException = makeCppException(exports.SocketException, "SocketReadException");
exports.SocketReadMultibyteRecordEndedPrematurelyException = makeCppException(exports.SocketReadException, "SocketReadMultibyteRecordEndedPrematurelyException");
exports.SocketWriteException = makeCppException(exports.SocketException, "SocketWriteException");
exports.SocketCouldNotWriteEverythingException = makeCppException(exports.SocketWriteException, "SocketCouldNotWriteEverythingException");

// HTTP-level exceptions are derived from HTTPException.
exports.HTTPException = makeCppException(exports.NetworkException, "HTTPException");

exports.HTTPNoBodyProvidedException = makeCppException(exports.HTTPException, "HTTPNoBodyProvidedException");
exports.HTTPRedirectNotAllowedException = makeCppException(exports.HTTPException, "HTTPRedirectNotAllowedException");
exports.HTTPRedirectLoopException = makeCppException(exports.HTTPException, "HTTPRedirectLoopException");

// AttemptedToSendHTTPResponseMoreThanOnce is a user code exception; not really an HTTP one.
exports.AttemptedToSendHTTPResponseMoreThanOnce = makeCppException(Exception, "AttemptedToSendHTTPResponseMoreThanOnce");
