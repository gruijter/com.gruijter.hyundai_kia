var StdOutFixture = require('./');




var fixture = new StdOutFixture();

fixture.capture(
	// Optionally, provide a capture fn here.
	// See readme for args.
	// e.g. function (string, encoding, fd) { return; }

	// Return `false` to prevent the write.
	// e.g. function (){ return false; }
);

// Uses intercepted version of stdout
console.log('a');
console.log('b');

fixture.release();

// Now we're back to the original version of stdout
console.log('c');
console.log('d');