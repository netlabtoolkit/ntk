var chai = require("chai"),
	expect = chai.expect;
var Hardware = require("../../../../server/modules/nlHardware/Hardware"),
	hw;



beforeEach(function() {
	hw = Hardware();
});

describe("returns a response", function() {
	it("returns a function", function(done) {
		expect(hw).to.be.an.instanceOf(Object);
	});
});
