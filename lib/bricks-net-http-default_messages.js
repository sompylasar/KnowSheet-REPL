'use strict';


// Looks plausible to keep error messages capitalized, with a newline at and end, and wrapped into an <h1>.
// Even though Bricks is mostly for backends, if we make them appear as JSON-s,
// along the lines of `{"error":404}`, our JSON-s are based on schemas, so that won't add much value.
// Thus, just keep them simple, unambiguous, curl- and browser-friendy for now -- D.K.
function DefaultFourOhFourMessage() { return "<h1>NOT FOUND</h1>\n"; }
function DefaultInternalServerErrorMessage() { return "<h1>INTERNAL SERVER ERROR</h1>\n"; }
function DefaultMethodNotAllowedMessage() { return "<h1>METHOD NOT ALLOWED</h1>\n"; }


exports.DefaultFourOhFourMessage = DefaultFourOhFourMessage;
exports.DefaultInternalServerErrorMessage = DefaultInternalServerErrorMessage;
exports.DefaultMethodNotAllowedMessage = DefaultMethodNotAllowedMessage;
